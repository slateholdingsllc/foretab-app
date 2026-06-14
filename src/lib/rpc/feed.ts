"use server";

import type { BusinessDisposition } from "@/lib/disposition/types";
import { createClient } from "@/lib/supabase/server";
import type { DashboardRecord, DispositionTab, FilterState, PageResult, SortOrder } from "@/lib/dashboard/types";
import { PAGE_SIZE } from "@/lib/dashboard/types";
import { decodeRpcOffset, encodeRpcCursor } from "./cursor";
import { detectRpcError } from "./errors";
import type { RawFeedRecord } from "./types";

/**
 * RPC-path implementation of the dashboard data layer (migration 000012).
 *
 * All FilterState fields now map to RPC params as of Phase 3. Known gaps:
 *
 *   Sort gaps (5 FilterState sorts with no RPC p_sort equivalent yet):
 *     issued_asc      → needs "issued-oldest"
 *     expiring_soonest→ needs "expiring-soonest"
 *     license_type_asc→ needs "license-a-z"
 *     license_type_desc→ needs "license-z-a"
 *     zip_asc         →  needs "zip-a-z"
 *   All 5 fall back to "newest" until Agent A adds them to the whitelist.
 *
 *   p_icp_relevance: no FilterState field yet; always null.
 *
 *   p_license_type: still null (filters license_type_raw; no FilterState source).
 *
 *   p_date_from: FilterState has no dateFrom field; only p_days_window is sent.
 */

// ---------------------------------------------------------------------------
// Sort mapping: FilterState.sort → RPC p_sort string
// ---------------------------------------------------------------------------

const RPC_SORT: Partial<Record<SortOrder, string>> = {
  newest_first:  "newest",
  oldest_first:  "oldest",
  name_asc:      "a-z",
  name_desc:     "z-a",
  city_asc:      "city-a-z",
  city_desc:     "city-z-a",
  issued_desc:   "issued-newest",
  // Gaps flagged to Agent A for migration 000013:
  // issued_asc       → "issued-oldest"
  // expiring_soonest → "expiring-soonest"
  // license_type_asc → "license-a-z"
  // license_type_desc→ "license-z-a"
  // zip_asc          → "zip-a-z"
};

// ---------------------------------------------------------------------------
// Disposition tab mapping: DispositionTab → p_disposition_status
// ---------------------------------------------------------------------------

function mapDispositionStatus(tab: DispositionTab): string | null {
  if (tab === "all") return null;
  // "uncontacted" in FilterState = records with no disposition row for this
  // customer. Agent A's RPC uses "none" for this semantic.
  if (tab === "uncontacted") return "none";
  // saved / working / won / lost / skip map directly.
  return tab;
}

// ---------------------------------------------------------------------------
// Build the shared filter param object used by get_feed, get_feed_count,
// and export_feed. Keeps the three call sites in sync automatically.
// ---------------------------------------------------------------------------

function buildFilterParams(filters: FilterState) {
  return {
    p_state_ids:          null as string[] | null,  // resolved + set by caller
    p_customer_status:    null,                      // invariant: never filtered
    p_license_type:       null,                      // license_type_raw not in FilterState
    p_license_record_type: filters.licenseTypes.length > 0 ? filters.licenseTypes : null,
    p_signal_strength:    filters.signalStrengths.length > 0 ? filters.signalStrengths : null,
    p_business_archetype: filters.businessArchetypes.length > 0 ? filters.businessArchetypes : null,
    p_days_window:        filters.daysWindow ?? null,
    p_date_from:          null,                      // FilterState has no dateFrom
    p_new_this_week:      filters.newThisWeek ? true : null,
    p_search:             filters.search.trim() || null,
    p_city:               filters.city.trim() || null,
    p_zip:                filters.zip.trim() || null,
    p_icp_relevance:      null,                      // no FilterState field yet
    p_disposition_status: mapDispositionStatus(filters.dispositionTab),
    p_sort:               RPC_SORT[filters.sort] ?? "newest",
  };
}

// ---------------------------------------------------------------------------
// State code map (state_id → state_code) — states table is NOT locked down
// ---------------------------------------------------------------------------

async function fetchStateCodeMap(stateIds: string[]): Promise<Map<string, string>> {
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

function rawToRecord(raw: RawFeedRecord, stateCodeMap: Map<string, string>): DashboardRecord {
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
    // RPC doesn't return signal_strength_reason; card renders it conditionally.
    signal_strength_reason: null,
    customer_status: raw.customer_status as DashboardRecord["customer_status"],
    disposition: null,
    // RPC doesn't return classified_records.notes (operator field, not customer-facing).
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
// State-code → UUID resolution
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

  const filterParams = buildFilterParams(filters);
  filterParams.p_state_ids = stateIdsResult.length > 0 ? stateIdsResult : null;

  const supabase = await createClient();

  const [feedResult, countResult] = await Promise.all([
    supabase.rpc("get_feed", {
      ...filterParams,
      p_limit: PAGE_SIZE + 1,
      p_offset: offset,
    }),
    supabase.rpc("get_feed_count", {
      ...filterParams,
      // get_feed_count has no p_limit, p_offset, p_sort
      p_limit: undefined,
      p_offset: undefined,
      p_sort: undefined,
    }),
  ]);

  if (feedResult.error) {
    detectRpcError(feedResult.error);
    throw new Error(`get_feed failed: ${feedResult.error.message}`);
  }

  const rows = (feedResult.data ?? []) as RawFeedRecord[];
  const hasMore = rows.length > PAGE_SIZE;
  const pageRows = rows.slice(0, PAGE_SIZE);

  const pageStateIds = Array.from(new Set(pageRows.map((r) => r.state_id)));
  const stateCodeMap = await fetchStateCodeMap(pageStateIds);

  const records: DashboardRecord[] = pageRows.map((r) => rawToRecord(r, stateCodeMap));

  const pageBusinessIds = Array.from(
    new Set(records.map((r) => r.business?.id).filter((id): id is string => Boolean(id))),
  );
  const dispositionMap = await fetchDispositionsByBusinessId(pageBusinessIds);
  for (const record of records) {
    const bid = record.business?.id;
    if (bid) record.disposition = dispositionMap.get(bid) ?? null;
  }

  const totalCount =
    !countResult.error && typeof countResult.data === "number"
      ? countResult.data
      : null;

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

  const filterParams = buildFilterParams(filters);
  filterParams.p_state_ids = stateIdsResult.length > 0 ? stateIdsResult : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("export_feed", {
    ...filterParams,
    // export_feed has no p_limit, p_offset
    p_limit: undefined,
    p_offset: undefined,
  });

  if (error) {
    throw new Error(`export_feed failed: ${error.message}`);
  }

  const rows = ((data ?? []) as RawFeedRecord[]).slice(0, limit);

  const exportStateIds = Array.from(new Set(rows.map((r) => r.state_id)));
  const stateCodeMap = await fetchStateCodeMap(exportStateIds);

  const records = rows.map((r) => rawToRecord(r, stateCodeMap));

  const exportBusinessIds = Array.from(
    new Set(records.map((r) => r.business?.id).filter((id): id is string => Boolean(id))),
  );
  const dispositionMap = await fetchDispositionsByBusinessId(exportBusinessIds);
  for (const record of records) {
    const bid = record.business?.id;
    if (bid) record.disposition = dispositionMap.get(bid) ?? null;
  }

  return records;
}
