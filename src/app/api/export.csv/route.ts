import { type NextRequest, NextResponse } from "next/server";
import { buildCsvFilename, serializeRecordsToCsv } from "@/lib/csv/serialize";
import { parseFiltersFromSearchParams } from "@/lib/dashboard/filters";
import {
  PAID_EXPORT_MAX_ROWS,
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
 *     If they've already exported N, this request returns at most (cap - N)
 *     rows. Cap reached → 403 with an explanation.
 *   - Paid customers: PAID_EXPORT_MAX_ROWS per export. No cumulative limit.
 *
 * Audit: every successful export INSERTs a csv_export_log row recording
 * customer_id, filter_config, row_count, state_ids. Append-only by RLS.
 * Audit row is written BEFORE the CSV response is generated to avoid
 * losing the audit trail if the customer disconnects mid-download — the
 * row_count we log is the actual count we're serving, decided pre-flight.
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
    .select("id, current_tier")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!customer) {
    return new NextResponse("Customer profile not found.", { status: 404 });
  }

  // Determine cap.
  const isTrial = !customer.current_tier;
  let cap: number;
  let alreadyExported = 0;

  if (isTrial) {
    // Confirm the trial is actually active — if their trial is expired AND
    // they have no tier, they shouldn't be able to export at all.
    const { data: trial } = await supabase
      .from("trials")
      .select("expires_at")
      .eq("customer_id", customer.id)
      .maybeSingle();
    const trialActive = trial?.expires_at && new Date(trial.expires_at) > new Date();
    if (!trialActive) {
      return NextResponse.json(
        {
          error:
            "Your trial has ended. Upgrade to a paid plan to export records.",
        },
        { status: 403 },
      );
    }

    alreadyExported = await fetchCumulativeExportRowCount(customer.id);
    const remaining = TRIAL_EXPORT_CUMULATIVE_CAP - alreadyExported;
    if (remaining <= 0) {
      return NextResponse.json(
        {
          error: `Trial export limit reached (${TRIAL_EXPORT_CUMULATIVE_CAP} records). Upgrade to a paid plan for higher limits.`,
          alreadyExported,
          cap: TRIAL_EXPORT_CUMULATIVE_CAP,
        },
        { status: 403 },
      );
    }
    cap = remaining;
  } else {
    cap = PAID_EXPORT_MAX_ROWS;
  }

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

  const records = await fetchAllRecordsForExport({ filters, limit: cap });

  // Collect distinct state_ids for the audit row's denormalized list.
  const stateIds = Array.from(new Set(records.map((r) => r.state_id))).filter(
    Boolean,
  );

  // Audit FIRST. If audit insert fails, refuse the export — losing the
  // audit trail is the worse failure mode (compliance > UX).
  const { error: auditError } = await supabase.from("csv_export_log").insert({
    customer_id: customer.id,
    filter_config: filters as unknown as Record<string, unknown>,
    row_count: records.length,
    state_ids: stateIds,
  });
  if (auditError) {
    console.error("[csv export] audit insert failed:", auditError);
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
      // Useful for the UI to refresh the trial counter without re-fetching.
      "X-Foretab-Export-Rows": String(records.length),
      ...(isTrial
        ? {
            "X-Foretab-Trial-Exported": String(alreadyExported + records.length),
            "X-Foretab-Trial-Cap": String(TRIAL_EXPORT_CUMULATIVE_CAP),
          }
        : {}),
    },
  });
}
