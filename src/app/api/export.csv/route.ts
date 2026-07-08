import { type NextRequest, NextResponse } from "next/server";
import { buildCsvFilename, serializeRecordsToCsv } from "@/lib/csv/serialize";
import { parseFiltersFromSearchParams } from "@/lib/dashboard/filters";
import {
  TRIAL_EXPORT_CUMULATIVE_CAP,
  fetchAllRecordsForExport,
  fetchCumulativeExportRowCount,
} from "@/lib/dashboard/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/export.csv?<filters>
 *
 * Generates a CSV of classified records matching the current filters and
 * returns it as a download. Auth via Supabase cookies; RLS scopes to the
 * customer's accessible states.
 *
 * Caps:
 *   - Trial customers (current_tier IS NULL with an active trial):
 *     TRIAL_EXPORT_CUMULATIVE_CAP rows cumulatively over the trial.
 *     log_csv_export() is called AFTER fetching with the actual row count
 *     so the audit records reality (not the cap). The advisory lock inside
 *     the RPC prevents concurrent double-spend; if the returned budget is
 *     less than records fetched, we slice before delivering.
 *   - Paid customers / internal: unlimited per Terms §7.
 *     log_csv_export() still audits the actual row count.
 *
 * C8: log_csv_export() RPC replaces the manual csv_export_log INSERT.
 *   - Paid/internal: fetch first (no limit), then call RPC with actual count.
 *   - Trial: pre-check cumulative → fetch with remaining limit → call RPC
 *     with actual count → slice to approved budget if race occurred.
 *   In both cases the audit write happens BEFORE CSV generation.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Not signed in.", { status: 401 });
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id, current_tier, account_type")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!customer) {
    return new NextResponse("Customer profile not found.", { status: 404 });
  }

  const isInternal = customer.account_type === "internal";
  const isTrial = !isInternal && !customer.current_tier;

  const url = new URL(request.url);
  const searchParams: Record<string, string | string[] | undefined> = {};
  url.searchParams.forEach((value, key) => {
    const existing = searchParams[key];
    if (existing === undefined) {
      searchParams[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      searchParams[key] = [existing, value];
    }
  });
  const filters = parseFiltersFromSearchParams(searchParams);

  if (isTrial) {
    // Confirm the trial is actually active before touching the RPC.
    const { data: trial } = await supabase
      .from("trials")
      .select("expires_at")
      .eq("customer_id", customer.id)
      .maybeSingle();
    const trialActive = trial?.expires_at && new Date(trial.expires_at) > new Date();
    if (!trialActive) {
      return NextResponse.json(
        { error: "Your trial has ended. Upgrade to a paid plan to export records." },
        { status: 403 },
      );
    }

    // Pre-check: fast 403 if budget is already fully consumed.
    const alreadyExported = await fetchCumulativeExportRowCount(customer.id);
    const remaining = TRIAL_EXPORT_CUMULATIVE_CAP - alreadyExported;
    if (remaining <= 0) {
      return NextResponse.json(
        {
          error: `Trial export limit reached (${TRIAL_EXPORT_CUMULATIVE_CAP} records). Upgrade to a paid plan for higher limits.`,
          cap: TRIAL_EXPORT_CUMULATIVE_CAP,
        },
        { status: 403 },
      );
    }

    // Fetch records bounded by remaining budget (not the full cap).
    // This ensures we never fetch more than could possibly be delivered.
    const allRecords = await fetchAllRecordsForExport({ filters, limit: remaining });

    // Log actual row count via RPC. The advisory lock prevents concurrent
    // double-spend. Returns the approved budget (min of remaining, p_row_count).
    // If another request consumed budget between our pre-check and now,
    // budget < allRecords.length and we slice before delivering.
    const { data: budget, error: logError } = await supabase.rpc("log_csv_export", {
      p_customer_id: customer.id,
      p_filter_config: filters as unknown as Record<string, unknown>,
      p_row_count: allRecords.length,
    });
    if (logError) {
      console.error("[csv export] log_csv_export (trial) failed:", logError);
      return NextResponse.json(
        { error: "Could not log export — aborting to preserve audit trail." },
        { status: 500 },
      );
    }
    const approvedBudget = budget as number;
    if (approvedBudget === 0) {
      return NextResponse.json(
        {
          error: `Trial export limit reached (${TRIAL_EXPORT_CUMULATIVE_CAP} records). Upgrade to a paid plan for higher limits.`,
          cap: TRIAL_EXPORT_CUMULATIVE_CAP,
        },
        { status: 403 },
      );
    }

    // Slice to approved budget (handles concurrent over-spend race).
    const records = allRecords.slice(0, approvedBudget);
    const csv = serializeRecordsToCsv(records);
    const filename = buildCsvFilename();

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Foretab-Export-Rows": String(records.length),
        "X-Foretab-Trial-Exported": String(alreadyExported + records.length),
        "X-Foretab-Trial-Cap": String(TRIAL_EXPORT_CUMULATIVE_CAP),
      },
    });
  }

  // Paid / internal path: fetch without a row cap (Terms §7: unlimited for paid).
  const records = await fetchAllRecordsForExport({ filters });

  // Collect distinct state_ids for the audit row.
  const stateIds = Array.from(new Set(records.map((r) => r.state_id))).filter(Boolean);

  // C8 paid path: log BEFORE generating CSV (if we crash after log but before
  // serialize, the row count is still faithfully recorded).
  const { error: logError } = await supabase.rpc("log_csv_export", {
    p_customer_id: customer.id,
    p_filter_config: filters as unknown as Record<string, unknown>,
    p_row_count: records.length,
    p_state_ids: stateIds,
  });
  if (logError) {
    console.error("[csv export] log_csv_export (paid) failed:", logError);
    return NextResponse.json(
      { error: "Could not log export — aborting to preserve audit trail." },
      { status: 500 },
    );
  }

  const csv = serializeRecordsToCsv(records);
  const filename = buildCsvFilename();

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Foretab-Export-Rows": String(records.length),
    },
  });
}
