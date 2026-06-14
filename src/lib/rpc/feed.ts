"use server";

import type { BusinessDisposition } from "@/lib/disposition/types";
import { createClient } from "@/lib/supabase/server";
import type { DashboardRecord, FilterState, PageResult } from "@/lib/dashboard/types";
import { PAGE_SIZE } from "@/lib/dashboard/types";
import { decodeRpcOffset, encodeRpcCursor } from "./cursor";
import { detectRpcError } from "./errors";
import type { RawFeedRecord } from "./types";

/**
 * RPC-path implementation of the dashboard data layer.
 *
 * Filter parity vs. the direct-PostgREST path — Phase 2 status:
 *   Supported:  states, search (also matches city), pagination
 *   No-op:      licenseTypes (wrong column in Phase 1 RPC: license_type_raw ≠
 *               license_record_type), signalStrengths, businessArchetypes,
 *               daysWindow, newThisWeek, city, zip, sort, dispositionTab
 *
 * Unsupported filters fall back to "return all" silently. Flag=false path is
 * unaffected and continues to support the full filter set. Add mappings here
 * as Agent A extends the RPC parameter set in future phases.
 *
 * Disposition enrichment still runs via customer_business_disposition (not
 * in the three-table lockdown) — identical to the direct path.
 */

// ---------------------------------------------------------------------------
// State code map (state_id → state_code) — states table is NOT locked down
// ---------------------------------------------------------------------------

async function fetchStateCodeMap(
  stateIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (stateIds.length === 0) return map;

  const supabase = await createClient();
  const { data } = await supabase
    .from("states")
    .select("id, state_code")
    .in("id", stateIds);

  for (const r of (data ?? []) as Array<{ id: string; state_code: string | null }>) {
    if (r.state_code) map.set(r.id, r.state_code);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Disposition enrichment (duplicated from queries.ts to avoid circular dep)
// ---------------------------------------------------------------------------

async function fetchDispositionsByBusinessId(
  businessIds: string[],
): Promise<Map<string, BusinessDisposition>> {
  const out = new Map<string, BusinessDisposition>();
  if (businessIds.length === 0) return out;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_business_disposition")
    .select("*")
    .in("business_id", businessIds);

  if (error) {
    console.error("[rpc/feed fetchDispositionsByBusinessId] query failed:", error);
    return out;
  }
  for (const r of (data ?? []) as BusinessDisposition[]) {
    out.set(r.business_id, r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mapper: flat RawFeedRecord → DashboardRecord
// ---------------------------------------------------------------------------

function rawToRecord(
  raw: RawFeedRecord,
  stateCodeMap: Map<string, string>,
): DashboardRecord {
  const stateCode = stateCodeMap.get(raw.state_id) ?? null;

  return {
    id: raw.id,
    // All published records are post-v1→v2 rename; RPC doesn't return the column.
    classification_version: "2",
    license_record_type: raw.license_record_type as DashboardRecord["license_record_type"],
    icp_relevance: raw.icp_relevance ?? [],
    business_archetype: raw.business_archetype as DashboardRecord["business_archetype"],
    on_premises: raw.on_premises,
    off_premises: raw.off_premises,
    beverage_scope: raw.beverage_scope as DashboardRecord["beverage_scope"],
    signal_strength: raw.signal_strength as DashboardRecord["signal_strength"],
    // RPC doesn't return signal_strength_reason; card renders it conditionally so null is safe.
    signal_strength_reason: null,
    customer_status: raw.customer_status as DashboardRecord["customer_status"],
    disposition: null,
    // RPC doesn't return classified_records.notes (operator field); null is safe.
    notes: null,
    classified_at: raw.classified_at,
    issued_date: raw.issued_date ?? null,
    first_observed_at: raw.first_observed_at ?? null,
    sort_date: raw.sort_date ?? null,
    state_id: raw.state_id,
    state_code: stateCode,
    data_source_channel: null,
    expiration_date: raw.expiration_date ?? null,
    license_type_raw: raw.license_type_raw ?? null,
    business_name: raw.business_name ?? null,
    dba_name: raw.dba ?? null,
    business: raw.business_id
      ? {
          id: raw.business_id,
          primary_legal_name: raw.business_name,
          primary_dba_name: raw.dba,
          primary_state_code: null,
        }
      : null,
    // Null when the record has no matched location row (LEFT JOIN miss).
    location: raw.location_id
      ? {
          id: raw.location_id,
          normalized_address: raw.location_normalized_address,
          street: raw.location_street,
          city: raw.location_city,
          // RPC doesn't return location.state_code; derive from state_id.
          state_code: stateCode,
          zip: raw.location_zip,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// State-code → UUID resolution (states table is NOT in the lockdown)
// ---------------------------------------------------------------------------

async function resolveStateIds(
  stateCodes: string[],
): Promise<string[] | "empty_filter"> {
  if (stateCodes.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("states")
    .select("id, state_code")
    .in("state_code", stateCodes);
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length === 0) return "empty_filter";
  return ids;
}

// ---------------------------------------------------------------------------
// Public: rpcFetchDashboardPage
// ---------------------------------------------------------------------------

export async function rpcFetchDashboardPage(args: {
  filters: FilterState;
  cursor: string | null;
}): Promise<PageResult> {
  const { filters } = args;
  const offset = decodeRpcOffset(args.cursor);

  const stateIdsResult = await resolveStateIds(filters.states);
  if (stateIdsResult === "empty_filter") {
    return { records: [], nextCursor: null, totalCount: 0 };
  }
  const stateIds = stateIdsResult.length > 0 ? stateIdsResult : null;

  // p_license_type filters license_type_raw (the raw string from state data,
  // e.g. "Full Retail Beer"). FilterState.licenseTypes holds LicenseRecordType
  // enum values (e.g. "new_issuance") which are a different column. Pass null
  // until Agent A adds a p_license_record_type parameter to get_feed.
  const search = filters.search.trim() || null;

  const supabase = await createClient();

  const [feedResult, countResult] = await Promise.all([
    supabase.rpc("get_feed", {
      p_state_ids: stateIds,
      p_limit: PAGE_SIZE + 1,
      p_offset: offset,
      p_customer_status: null,
      p_license_type: null,
      p_search: search,
    }),
    supabase.rpc("get_feed_count", {
      p_state_ids: stateIds,
      p_customer_status: null,
      p_license_type: null,
      p_search: search,
    }),
  ]);

  if (feedResult.error) {
    detectRpcError(feedResult.error);
    throw new Error(`get_feed failed: ${feedResult.error.message}`);
  }

  const rows = (feedResult.data ?? []) as RawFeedRecord[];
  const hasMore = rows.length > PAGE_SIZE;
  const pageRows = rows.slice(0, PAGE_SIZE);

  // Resolve state_id → state_code for the unique state IDs on this page.
  const pageStateIds = Array.from(new Set(pageRows.map((r) => r.state_id)));
  const stateCodeMap = await fetchStateCodeMap(pageStateIds);

  const records: DashboardRecord[] = pageRows.map((r) => rawToRecord(r, stateCodeMap));

  const pageBusinessIds = Array.from(
    new Set(
      records
        .map((r) => r.business?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const dispositionMap = await fetchDispositionsByBusinessId(pageBusinessIds);
  for (const record of records) {
    const bid = record.business?.id;
    if (bid) record.disposition = dispositionMap.get(bid) ?? null;
  }

  // count is not quota-gated; best-effort (null on error rather than throw)
  const totalCount =
    !countResult.error && typeof countResult.data === "number"
      ? countResult.data
      : null;

  // Fire-and-forget access log — POST transaction, so INSERT works.
  void Promise.resolve(supabase.rpc("log_feed_access", { p_rpc_name: "get_feed" })).catch(() => {});

  return {
    records,
    nextCursor: hasMore ? encodeRpcCursor(offset + PAGE_SIZE) : null,
    totalCount,
  };
}

// ---------------------------------------------------------------------------
// Public: rpcFetchAllRecordsForExport
// ---------------------------------------------------------------------------

export async function rpcFetchAllRecordsForExport(args: {
  filters: FilterState;
  limit: number;
}): Promise<DashboardRecord[]> {
  if (args.limit <= 0) return [];

  const { filters, limit } = args;

  const stateIdsResult = await resolveStateIds(filters.states);
  if (stateIdsResult === "empty_filter") return [];
  const stateIds = stateIdsResult.length > 0 ? stateIdsResult : null;

  const search = filters.search.trim() || null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("export_feed", {
    p_state_ids: stateIds,
    p_customer_status: null,
    p_license_type: null,
    p_search: search,
  });

  if (error) {
    throw new Error(`export_feed failed: ${error.message}`);
  }

  const rows = ((data ?? []) as RawFeedRecord[]).slice(0, limit);

  // Resolve state codes for all unique state IDs in the export batch.
  const exportStateIds = Array.from(new Set(rows.map((r) => r.state_id)));
  const stateCodeMap = await fetchStateCodeMap(exportStateIds);

  const records = rows.map((r) => rawToRecord(r, stateCodeMap));

  const exportBusinessIds = Array.from(
    new Set(
      records
        .map((r) => r.business?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const dispositionMap = await fetchDispositionsByBusinessId(exportBusinessIds);
  for (const record of records) {
    const bid = record.business?.id;
    if (bid) record.disposition = dispositionMap.get(bid) ?? null;
  }

  // Fire-and-forget access log.
  void Promise.resolve(supabase.rpc("log_feed_access", { p_rpc_name: "export_feed" })).catch(() => {});

  return records;
}
