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
 * Filter support vs. the direct-PostgREST path:
 *   Supported:   states, licenseTypes (single value), search, pagination
 *   Not yet:     signalStrengths, businessArchetypes, daysWindow,
 *                newThisWeek, city, zip, sort, dispositionTab
 *
 * Unsupported filters are silently no-op'd in this path (they run fine
 * on the flag=false path). When A extends the RPC parameter set in a
 * future phase, add the mappings here and remove from the list above.
 *
 * Disposition enrichment (adding the customer's saved/working/etc. row
 * to each card) still runs via a separate customer_business_disposition
 * query — that table is NOT in the three-table lockdown.
 */

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

function rawToRecord(raw: RawFeedRecord): DashboardRecord {
  return {
    id: raw.id,
    classification_version: raw.classification_version,
    license_record_type: raw.license_record_type as DashboardRecord["license_record_type"],
    icp_relevance: raw.icp_relevance ?? [],
    business_archetype: raw.business_archetype as DashboardRecord["business_archetype"],
    on_premises: raw.on_premises,
    off_premises: raw.off_premises,
    beverage_scope: raw.beverage_scope as DashboardRecord["beverage_scope"],
    signal_strength: raw.signal_strength as DashboardRecord["signal_strength"],
    signal_strength_reason: raw.signal_strength_reason,
    customer_status: raw.customer_status as DashboardRecord["customer_status"],
    disposition: null,
    notes: raw.notes,
    classified_at: raw.classified_at,
    issued_date: raw.issued_date ?? null,
    first_observed_at: raw.first_observed_at ?? null,
    sort_date: raw.sort_date ?? null,
    state_id: raw.state_id,
    state_code: raw.state_code,
    data_source_channel: null,
    expiration_date: raw.expiration_date ?? null,
    license_type_raw: raw.license_type_raw ?? null,
    // COALESCE'd by RPC — same field names, values only improve
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
    // Reconstruct the nested location object from flat RPC fields.
    // Null when the record has no matched location row (LEFT JOIN miss).
    location: raw.location_id
      ? {
          id: raw.location_id,
          normalized_address: raw.location_normalized_address,
          street: raw.location_street,
          city: raw.location_city,
          state_code: raw.location_state_code ?? raw.state_code,
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

  // Single license-type mapping (RPC accepts one string, not an array).
  // Multi-select is a no-op in this path — filter only when exactly one type is active.
  const licenseType =
    filters.licenseTypes.length === 1 ? filters.licenseTypes[0] : null;
  const search = filters.search.trim() || null;

  const supabase = await createClient();

  const [feedResult, countResult] = await Promise.all([
    supabase.rpc("get_feed", {
      p_state_ids: stateIds,
      p_limit: PAGE_SIZE + 1,
      p_offset: offset,
      p_customer_status: null,
      p_license_type: licenseType,
      p_search: search,
    }),
    supabase.rpc("get_feed_count", {
      p_state_ids: stateIds,
      p_customer_status: null,
      p_license_type: licenseType,
      p_search: search,
    }),
  ]);

  if (feedResult.error) {
    detectRpcError(feedResult.error);
    throw new Error(`get_feed failed: ${feedResult.error.message}`);
  }

  const rows = (feedResult.data ?? []) as RawFeedRecord[];
  const hasMore = rows.length > PAGE_SIZE;
  const records: DashboardRecord[] = rows.slice(0, PAGE_SIZE).map(rawToRecord);

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

  const licenseType =
    filters.licenseTypes.length === 1 ? filters.licenseTypes[0] : null;
  const search = filters.search.trim() || null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("export_feed", {
    p_state_ids: stateIds,
    p_customer_status: null,
    p_license_type: licenseType,
    p_search: search,
  });

  if (error) {
    throw new Error(`export_feed failed: ${error.message}`);
  }

  const rows = ((data ?? []) as RawFeedRecord[]).slice(0, limit);
  const records = rows.map(rawToRecord);

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

  return records;
}
