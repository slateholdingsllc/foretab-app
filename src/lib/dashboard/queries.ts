import { createClient } from "@/lib/supabase/server";
import { decodeCursor, encodeCursor } from "./cursor";
import type { DashboardRecord, FilterState, PageResult } from "./types";
import { PAGE_SIZE } from "./types";

/**
 * Fetch one page of classified_records for the current authenticated
 * customer, joined to businesses + locations + states for display.
 *
 * RLS does the heavy lifting — the WHERE state_id IN (accessible) check
 * is enforced by migration 016's authenticated_select_accessible_states
 * policy on classified_records, plus the via-classified_records policies
 * on businesses + locations. App code only adds optional filters on top.
 *
 * Pagination is cursor-based per dispatch §9.4 — composite
 * (classified_at, id) cursor avoids OFFSET scans as classified_records
 * grows. We fetch PAGE_SIZE+1 rows and use the extra row to determine
 * if there's a next page (saves a separate hasNextPage round-trip).
 *
 * Count is exact via PostgREST's `{ count: "exact" }` for the scaffold.
 * Per dispatch §9.4, this should move to pre-aggregated / cached counts
 * once classified_records grows past hundreds of thousands of rows.
 * TODO: cache this in customer_states.last_known_count or a derived view.
 */
export async function fetchDashboardPage(args: {
  filters: FilterState;
  cursor: string | null;
}): Promise<PageResult> {
  const supabase = await createClient();
  const cursor = decodeCursor(args.cursor);
  const { filters } = args;

  // Build the joined SELECT. PostgREST infers FKs by relationship name —
  // classified_records has exactly one FK to each of these tables, so
  // unambiguous. If we ever add a second FK to the same table, we'll
  // need explicit !fk_name notation.
  let query = supabase
    .from("classified_records")
    .select(
      `
      id,
      classification_version,
      license_record_type,
      icp_relevance,
      business_archetype,
      on_premises,
      off_premises,
      beverage_scope,
      signal_strength,
      signal_strength_reason,
      notes,
      classified_at,
      state_id,
      businesses ( id, primary_legal_name, primary_dba_name, primary_state_code ),
      locations ( id, normalized_address, street, city, state_code, zip ),
      states ( state_code )
    `,
      { count: "exact" },
    );

  // -- Filters --

  if (filters.states.length > 0) {
    // FilterState.states is state CODES; resolve to ids via subquery is
    // not possible in PostgREST. Resolve in a separate call.
    const { data: stateRows } = await supabase
      .from("states")
      .select("id, state_code")
      .in("state_code", filters.states);
    const stateIds = (stateRows ?? []).map((r) => r.id);
    if (stateIds.length === 0) {
      // Filter referenced state codes the customer doesn't actually have
      // access to (or that don't exist). Return empty.
      return { records: [], nextCursor: null, totalCount: 0 };
    }
    query = query.in("state_id", stateIds);
  }

  if (filters.licenseTypes.length > 0) {
    query = query.in("license_record_type", filters.licenseTypes);
  }
  if (filters.signalStrengths.length > 0) {
    query = query.in("signal_strength", filters.signalStrengths);
  }
  if (filters.businessArchetypes.length > 0) {
    query = query.in("business_archetype", filters.businessArchetypes);
  }
  if (filters.daysWindow !== null) {
    const threshold = new Date(
      Date.now() - filters.daysWindow * 24 * 60 * 60 * 1000,
    ).toISOString();
    query = query.gte("classified_at", threshold);
  }

  // -- Sort + cursor --

  const ascending = filters.sort === "oldest_first";
  query = query
    .order("classified_at", { ascending })
    .order("id", { ascending });

  if (cursor) {
    // Composite cursor: rows strictly past (cursor.c, cursor.i) in sort
    // direction. PostgREST .or() syntax: comma-separated alternatives.
    if (ascending) {
      query = query.or(
        `classified_at.gt.${cursor.c},and(classified_at.eq.${cursor.c},id.gt.${cursor.i})`,
      );
    } else {
      query = query.or(
        `classified_at.lt.${cursor.c},and(classified_at.eq.${cursor.c},id.lt.${cursor.i})`,
      );
    }
  }

  // Fetch PAGE_SIZE + 1 so we can detect "is there a next page" without
  // a separate hasNextPage query.
  query = query.limit(PAGE_SIZE + 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`fetchDashboardPage failed: ${error.message}`);
  }

  // Supabase JS returns embedded relations as either a single object or
  // an array depending on cardinality detection. For our many-to-one
  // joins (each classified_record has at most one business, one location,
  // one state), they come back as single objects or null.
  const rows = (data ?? []) as unknown as Array<
    Omit<DashboardRecord, "business" | "location" | "state_code" | "data_source_channel"> & {
      businesses: DashboardRecord["business"];
      locations: DashboardRecord["location"];
      states: { state_code: string | null } | null;
    }
  >;

  const records: DashboardRecord[] = rows.slice(0, PAGE_SIZE).map((r) => ({
    id: r.id,
    classification_version: r.classification_version,
    license_record_type: r.license_record_type,
    icp_relevance: r.icp_relevance ?? [],
    business_archetype: r.business_archetype,
    on_premises: r.on_premises,
    off_premises: r.off_premises,
    beverage_scope: r.beverage_scope,
    signal_strength: r.signal_strength,
    signal_strength_reason: r.signal_strength_reason,
    notes: r.notes,
    classified_at: r.classified_at,
    state_id: r.state_id,
    state_code: r.states?.state_code ?? null,
    // Reserved column — null until Agent A adds classified_records.data_source_channel
    data_source_channel: null,
    business: r.businesses,
    location: r.locations,
  }));

  const hasMore = rows.length > PAGE_SIZE;
  const last = records[records.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor({ c: last.classified_at, i: last.id }) : null;

  return {
    records,
    nextCursor,
    totalCount: count ?? null,
  };
}

/**
 * Fetch the customer's trial + tier metadata for the top bar
 * (trial countdown, tier badge). Returns nulls cleanly if the customer
 * row doesn't exist or the trial hasn't been created yet — top bar
 * handles missing data gracefully.
 */
export async function fetchCustomerContext(): Promise<{
  customerId: string | null;
  email: string | null;
  status: string | null;
  currentTier: string | null;
  trialExpiresAt: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      customerId: null,
      email: null,
      status: null,
      currentTier: null,
      trialExpiresAt: null,
    };
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id, email, status, current_tier")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  let trialExpiresAt: string | null = null;
  if (customer?.id) {
    const { data: trial } = await supabase
      .from("trials")
      .select("expires_at")
      .eq("customer_id", customer.id)
      .eq("status", "active")
      .maybeSingle();
    trialExpiresAt = trial?.expires_at ?? null;
  }

  return {
    customerId: customer?.id ?? null,
    email: customer?.email ?? user.email ?? null,
    status: customer?.status ?? null,
    currentTier: customer?.current_tier ?? null,
    trialExpiresAt,
  };
}

/**
 * Fetch the state codes the customer has access to. Used to populate
 * the state filter dropdown — customer only sees states they can
 * actually subscribe to.
 */
export async function fetchAccessibleStateCodes(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_states")
    .select("states ( state_code )")
    .order("state_id");

  if (error) return [];
  const rows = (data ?? []) as unknown as Array<{
    states: { state_code: string | null } | null;
  }>;
  return rows
    .map((r) => r.states?.state_code)
    .filter((s): s is string => Boolean(s))
    .sort();
}

/**
 * Fetch data_source_health for all states in the customer's accessible
 * set, returned as a Map keyed by state_id. Powers the per-record
 * freshness badge (RecordCard) and the degraded-state banner
 * (DegradedStateBanner on the dashboard root).
 *
 * RLS does the state-scoping (migration 018): the authenticated SELECT
 * policy on data_source_health uses customer_accessible_state_ids().
 * Customer sees one row per accessible state automatically.
 *
 * Joined to states for state_code + refresh_frequency since both are
 * needed by the freshness classifier.
 */
import type { StateHealthEntry, StateHealthMap } from "./types";

export async function fetchDataSourceHealthMap(): Promise<StateHealthMap> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_source_health")
    .select(
      `
      state_id,
      last_refresh_at,
      status,
      error_count_24h,
      states ( state_code, refresh_frequency )
    `,
    );

  if (error) {
    console.error("[fetchDataSourceHealthMap] query failed:", error);
    return new Map();
  }

  const rows = (data ?? []) as unknown as Array<{
    state_id: string;
    last_refresh_at: string | null;
    status: string | null;
    error_count_24h: number | null;
    states: { state_code: string | null; refresh_frequency: string | null } | null;
  }>;

  const map: StateHealthMap = new Map();
  for (const r of rows) {
    const entry: StateHealthEntry = {
      state_id: r.state_id,
      state_code: r.states?.state_code ?? null,
      refresh_frequency: r.states?.refresh_frequency ?? null,
      last_refresh_at: r.last_refresh_at,
      status: r.status,
      error_count_24h: r.error_count_24h,
    };
    map.set(r.state_id, entry);
  }
  return map;
}
