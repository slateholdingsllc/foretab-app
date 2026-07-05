"use server";

import type { BusinessDisposition } from "@/lib/disposition/types";
import { createClient } from "@/lib/supabase/server";
import type { DashboardRecord, DispositionTab, FilterState, MapPin, PageResult, SortOrder } from "@/lib/dashboard/types";
import { PAGE_SIZE } from "@/lib/dashboard/types";
import { decodeRpcOffset, encodeRpcCursor } from "./cursor";
import { detectRpcError } from "./errors";
import type { RawFeedRecord } from "./types";

/**
 * RPC-path implementation of the dashboard data layer.
 *
 * All 9 filter axes are wired to migration-000012 parameters.
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
    lead_type: raw.lead_type ?? null,
    premises_state_code: raw.premises_state_code ?? null,
    in_state: raw.in_state ?? null,
  };
}

// ---------------------------------------------------------------------------
// Filter mapping helpers
// ---------------------------------------------------------------------------

const RPC_SORT: Partial<Record<SortOrder, string>> = {
  newest_first: "newest",
  oldest_first: "oldest",
  name_asc:     "a-z",
  name_desc:    "z-a",
  city_asc:     "city-a-z",
  city_desc:    "city-z-a",
  issued_desc:  "issued-newest",
  // Gaps flagged to Agent A for 000013:
  // issued_asc → "issued-oldest", expiring_soonest → "expiring-soonest"
  // license_type_asc → "license-a-z", license_type_desc → "license-z-a", zip_asc → "zip-a-z"
};

function mapDispositionStatus(tab: DispositionTab): string | null {
  if (tab === "all") return null;
  if (tab === "uncontacted") return "none"; // A's semantic: no disposition row
  return tab; // saved/working/won/lost/skip map directly
}

function buildFilterParams(filters: FilterState) {
  return {
    p_state_ids:           null as string[] | null, // caller sets after build
    p_customer_status: (
      filters.licenseTypes.length > 0 &&
      filters.licenseTypes.every((t) => t === "new_issuance" || t === "application")
    ) ? ["Active", "Pending"] : null,
    p_license_type:        null,
    p_license_record_type: filters.licenseTypes.length > 0 ? filters.licenseTypes : null,
    p_signal_strength:     filters.signalStrengths.length > 0 ? filters.signalStrengths : null,
    p_business_archetype:  filters.businessArchetypes.length > 0 ? filters.businessArchetypes : null,
    p_days_window:         filters.daysWindow ?? undefined, // undefined = omit → DB uses DEFAULT 180; null would override it
    p_date_from:           null,
    p_new_this_week:       filters.newThisWeek ? true : false,
    p_search:              filters.search.trim() || null,
    p_city:                filters.city.trim() || null,
    p_zip:                 filters.zip.trim() || null,
    p_icp_relevance:       null,
    p_disposition_status:  mapDispositionStatus(filters.dispositionTab),
    p_sort:                RPC_SORT[filters.sort] ?? "newest",
    // p_lead_type added by Agent A in migration 000003 RPC update.
    // undefined (not null) so it is omitted from JSON when not filtering —
    // safe to call get_feed before A's RPC param migration is live.
    p_lead_type: filters.leadTypes.length > 0 ? filters.leadTypes : undefined,
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

  const filterParams = buildFilterParams(filters);
  filterParams.p_state_ids = stateIds;

  const supabase = await createClient();

  const [feedResult, countResult] = await Promise.all([
    supabase.rpc("get_feed", {
      ...filterParams,
      p_limit: PAGE_SIZE + 1,
      p_offset: offset,
      p_lead_type: undefined, // omit until Agent A adds to get_feed
    }),
    supabase.rpc("get_feed_count", {
      ...filterParams,
      p_limit: undefined,
      p_offset: undefined,
      p_sort: undefined,
      p_lead_type: undefined, // omit until Agent A adds to get_feed_count
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
// Public: rpcFetchUncontactedCount
// ---------------------------------------------------------------------------

/**
 * Count of license records that have no disposition row yet (uncontacted),
 * using the same filter axes as rpcFetchDashboardPage. Both "All" and
 * "Uncontacted" counts now measure RECORDS (COUNT(*)) so the numbers are
 * directly comparable and the delta is legible.
 */
export async function rpcFetchUncontactedCount(
  filters: FilterState,
): Promise<number | null> {
  const stateIdsResult = await resolveStateIds(filters.states);
  if (stateIdsResult === "empty_filter") return 0;
  const stateIds = stateIdsResult.length > 0 ? stateIdsResult : null;

  const filterParams = buildFilterParams(filters);
  filterParams.p_state_ids = stateIds;
  filterParams.p_disposition_status = "none"; // always count uncontacted regardless of active tab

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_feed_count", {
    ...filterParams,
    p_limit: undefined,
    p_offset: undefined,
    p_sort: undefined,
    p_lead_type: undefined,
  });

  if (error) {
    console.error("[rpcFetchUncontactedCount]", error);
    return null;
  }
  return typeof data === "number" ? data : null;
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

  const filterParams = buildFilterParams(filters);
  filterParams.p_state_ids = stateIds;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("export_feed", {
    ...filterParams,
    p_limit: undefined,
    p_offset: undefined,
    p_lead_type: undefined, // omit until Agent A adds to export_feed
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

  // Fire-and-forget access log — POST transaction, so INSERT works.
  void Promise.resolve(supabase.rpc("log_feed_access", { p_rpc_name: "export_feed" })).catch(() => {});

  return records;
}

// ---------------------------------------------------------------------------
// Public: rpcFetchDashboardPageByBusiness
// ---------------------------------------------------------------------------
// Business-grain pagination for the Opening Now view. get_feed_by_business
// returns exactly ONE row per business (the headline — freshest qualifying
// record selected by ROW_NUMBER() within partition). p_offset counts
// distinct businesses, not classified_records, so page boundaries never
// split a multi-license business across pages.
//
// get_feed_by_business does not expose p_date_from or p_lead_type; those
// params are omitted from the call.

export async function rpcFetchDashboardPageByBusiness(args: {
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

  const fp = buildFilterParams(filters);

  const supabase = await createClient();

  const [feedResult, countResult] = await Promise.all([
    supabase.rpc("get_feed_by_business", {
      p_state_ids:           stateIds,
      p_limit:               PAGE_SIZE + 1,
      p_offset:              offset,
      p_customer_status:     fp.p_customer_status,
      p_license_type:        fp.p_license_type,
      p_search:              fp.p_search,
      p_license_record_type: fp.p_license_record_type,
      p_signal_strength:     fp.p_signal_strength,
      p_business_archetype:  fp.p_business_archetype,
      p_days_window:         fp.p_days_window,
      p_new_this_week:       fp.p_new_this_week,
      p_city:                fp.p_city,
      p_zip:                 fp.p_zip,
      p_icp_relevance:       fp.p_icp_relevance,
      p_disposition_status:  fp.p_disposition_status,
      p_sort:                fp.p_sort,
    }),
    supabase.rpc("get_feed_by_business_count", {
      p_state_ids:           stateIds,
      p_customer_status:     fp.p_customer_status,
      p_license_type:        fp.p_license_type,
      p_search:              fp.p_search,
      p_license_record_type: fp.p_license_record_type,
      p_signal_strength:     fp.p_signal_strength,
      p_business_archetype:  fp.p_business_archetype,
      p_days_window:         fp.p_days_window,
      p_new_this_week:       fp.p_new_this_week,
      p_city:                fp.p_city,
      p_zip:                 fp.p_zip,
      p_icp_relevance:       fp.p_icp_relevance,
      p_disposition_status:  fp.p_disposition_status,
    }),
  ]);

  if (feedResult.error) {
    detectRpcError(feedResult.error);
    throw new Error(`get_feed_by_business failed: ${feedResult.error.message}`);
  }

  const rows = (feedResult.data ?? []) as RawFeedRecord[];
  const hasMore = rows.length > PAGE_SIZE;
  const pageRows = rows.slice(0, PAGE_SIZE);

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

  const totalCount =
    !countResult.error && typeof countResult.data === "number"
      ? countResult.data
      : !countResult.error && typeof countResult.data === "bigint"
        ? Number(countResult.data)
        : null;

  void Promise.resolve(supabase.rpc("log_feed_access", { p_rpc_name: "get_feed_by_business" })).catch(() => {});

  return {
    records,
    nextCursor: hasMore ? encodeRpcCursor(offset + PAGE_SIZE) : null,
    totalCount,
  };
}

// ---------------------------------------------------------------------------
// Public: fetchBusinessLicenseHistory
// ---------------------------------------------------------------------------
// Full license lifecycle for a business card's history expand. Called from
// the BusinessCardHistory client component via server-action import.
//
// Returns all published records for the business ordered sort_date DESC,
// with the headline record filtered out (caller passes headlineId).
// Access-gated by get_business_license_history's SECURITY DEFINER RLS:
// business_accessible_to_customer() returns empty set for out-of-scope
// businesses rather than erroring.

export async function fetchBusinessLicenseHistory(
  businessId: string,
  headlineId: string,
): Promise<DashboardRecord[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_business_license_history", {
    p_business_id: businessId,
  });

  if (error) {
    console.error("[fetchBusinessLicenseHistory]", error);
    return [];
  }

  const rows = ((data ?? []) as RawFeedRecord[]).filter((r) => r.id !== headlineId);
  if (rows.length === 0) return [];

  const stateIds = Array.from(new Set(rows.map((r) => r.state_id)));
  const stateCodeMap = await fetchStateCodeMap(stateIds);

  const records: DashboardRecord[] = rows.map((r) => rawToRecord(r, stateCodeMap));

  // Single business — one disposition lookup covers all history records.
  const dispositionMap = await fetchDispositionsByBusinessId([businessId]);
  const disposition = dispositionMap.get(businessId) ?? null;
  for (const record of records) {
    record.disposition = disposition;
  }

  return records;
}

// ---------------------------------------------------------------------------
// Public: fetchMapPins
// ---------------------------------------------------------------------------
// Returns a lightweight MapPin[] for the map tab. Calls get_feed with a
// high p_limit cap, then does a secondary SELECT on locations for lat/lng
// (coordinates are NOT in the feed_record composite type).
//
// Coordinate lookup is batched in chunks of 500 to avoid Supabase's 1000-row
// .in() cap (see supabase-1000-row-cap memory).

const MAP_PIN_LIMIT = 500; // 2000 Leaflet SVG markers stalls the browser; 500 is the UX sweet spot

export async function fetchMapPins(filters: FilterState): Promise<{
  pins: MapPin[];
  placedCount: number;
  unplacedCount: number;
}> {
  const stateIdsResult = await resolveStateIds(filters.states);
  if (stateIdsResult === "empty_filter") {
    return { pins: [], placedCount: 0, unplacedCount: 0 };
  }
  const stateIds = stateIdsResult.length > 0 ? stateIdsResult : null;

  const filterParams = buildFilterParams(filters);
  filterParams.p_state_ids = stateIds;

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_feed", {
    ...filterParams,
    p_limit: MAP_PIN_LIMIT,
    p_offset: 0,
    p_lead_type: undefined,
  });

  if (error) {
    console.error("[fetchMapPins] get_feed failed:", error);
    return { pins: [], placedCount: 0, unplacedCount: 0 };
  }

  const rows = (data ?? []) as RawFeedRecord[];
  if (rows.length === 0) return { pins: [], placedCount: 0, unplacedCount: 0 };

  // Secondary lat/lng lookup — not in feed_record, must SELECT from locations.
  const locationIds = Array.from(
    new Set(rows.filter((r) => r.location_id).map((r) => r.location_id as string)),
  );
  const coordMap = new Map<string, { lat: number; lng: number }>();
  for (let i = 0; i < locationIds.length; i += 500) {
    const batch = locationIds.slice(i, i + 500);
    const { data: locData } = await supabase
      .from("locations")
      .select("id, latitude, longitude")
      .in("id", batch);
    for (const loc of (locData ?? []) as Array<{
      id: string;
      latitude: number | null;
      longitude: number | null;
    }>) {
      if (loc.latitude !== null && loc.longitude !== null) {
        coordMap.set(loc.id, { lat: loc.latitude, lng: loc.longitude });
      }
    }
  }

  const pageStateIds = Array.from(new Set(rows.map((r) => r.state_id)));
  const stateCodeMap = await fetchStateCodeMap(pageStateIds);

  const businessIds = Array.from(
    new Set(rows.filter((r) => r.business_id).map((r) => r.business_id as string)),
  );
  const dispositionMap = await fetchDispositionsByBusinessId(businessIds);

  let placedCount = 0;
  let unplacedCount = 0;

  const pins: MapPin[] = rows.map((raw) => {
    const stateCode = stateCodeMap.get(raw.state_id) ?? null;
    const coords = raw.location_id ? coordMap.get(raw.location_id) : undefined;
    if (coords) placedCount++;
    else unplacedCount++;

    return {
      id: raw.id,
      businessId: raw.business_id,
      businessName: raw.business_name,
      locationId: raw.location_id,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      premisesStateCode: raw.premises_state_code,
      inState: raw.in_state,
      licenseStateCode: stateCode,
      signalStrength: raw.signal_strength,
      licenseRecordType: raw.license_record_type,
      city: raw.location_city,
      zip: raw.location_zip,
      disposition: raw.business_id ? (dispositionMap.get(raw.business_id) ?? null) : null,
    };
  });

  void Promise.resolve(supabase.rpc("log_feed_access", { p_rpc_name: "get_feed" })).catch(() => {});

  return { pins, placedCount, unplacedCount };
}

// ---------------------------------------------------------------------------
// Public: lookupZipCenter
// ---------------------------------------------------------------------------
// Returns an approximate lat/lng centroid for a ZIP code derived from the
// average of all location coordinates in that ZIP. Used by the map's radius
// search. Returns null if no geocoded locations exist for the ZIP.

export async function lookupZipCenter(
  zip: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!zip || !/^\d{5}$/.test(zip)) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("locations")
    .select("latitude, longitude")
    .eq("zip", zip)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(100);

  const locs = (data ?? []) as Array<{ latitude: number; longitude: number }>;
  if (locs.length === 0) return null;

  const lat = locs.reduce((s, l) => s + l.latitude, 0) / locs.length;
  const lng = locs.reduce((s, l) => s + l.longitude, 0) / locs.length;
  return { lat, lng };
}
