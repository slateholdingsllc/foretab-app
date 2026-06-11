import type {
  BusinessDisposition,
  DispositionStatus,
} from "@/lib/disposition/types";
import { createClient } from "@/lib/supabase/server";
import { decodeCursor, encodeCursor } from "./cursor";
import { normalizeFilterConfig, type SavedFilter } from "./saved-filters";
import type { DashboardRecord, FilterState, PageResult } from "./types";
import { PAGE_SIZE, PROTECTED_DISPOSITION_STATUSES } from "./types";

/**
 * Hard upper bound on a single CSV export. Per dispatch §14.3. Enforced
 * in app layer (the DB doesn't know about export semantics).
 */
export const PAID_EXPORT_MAX_ROWS = 10_000;
/** Trial customers can export this many records CUMULATIVELY over their trial. */
export const TRIAL_EXPORT_CUMULATIVE_CAP = 25;

/**
 * Fetch business_ids of the current customer's protected dispositions
 * (saved/working/won/lost). These business_ids override the
 * customer_status='Inactive' hide predicate so a lead the rep is actively
 * pursuing never silently vanishes when its license flips to Inactive.
 *
 * RLS on customer_business_disposition scopes to current_customer_id(), so
 * no .eq("customer_id", ...) is needed. Returns [] on auth error or empty
 * result.
 *
 * Returns IDs as a string array, not a Set — the call sites pass them
 * directly to PostgREST's .in.() filter via the OR string builder.
 */
async function fetchProtectedDispositionedBusinessIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_business_disposition")
    .select("business_id")
    .in("status", PROTECTED_DISPOSITION_STATUSES as unknown as string[]);

  if (error) {
    console.error(
      "[fetchProtectedDispositionedBusinessIds] query failed:",
      error,
    );
    return [];
  }
  return ((data ?? []) as Array<{ business_id: string }>).map(
    (r) => r.business_id,
  );
}

/**
 * Fetch business_ids the current customer has dispositioned with a given
 * status, or all dispositioned business_ids when `status = "any"`. Used by
 * the StatusTabs filter axis:
 *   tab in {saved, working, won, lost, skip}  →  status = that value
 *   tab = "uncontacted"                       →  status = "any" (then NOT IN)
 *   tab = "all"                               →  not called
 * RLS scopes to current_customer_id() so no explicit customer_id filter.
 */
async function fetchBusinessIdsByDispositionStatus(
  status: DispositionStatus | "any",
): Promise<string[]> {
  const supabase = await createClient();
  let q = supabase.from("customer_business_disposition").select("business_id");
  if (status !== "any") {
    q = q.eq("status", status);
  }
  const { data, error } = await q;
  if (error) {
    console.error("[fetchBusinessIdsByDispositionStatus] query failed:", error);
    return [];
  }
  return ((data ?? []) as Array<{ business_id: string }>).map(
    (r) => r.business_id,
  );
}

/**
 * Build the customer_status hide predicate as a PostgREST .or() argument.
 * Combines the null-safe Inactive hide (kept for Task 3 contract) with the
 * Task 4 dispositioned-override: any record whose parent business has a
 * protected disposition stays visible regardless of customer_status.
 *
 * Returns null when no predicate is needed (showInactive=true).
 */
function buildCustomerStatusOrClause(
  showInactive: boolean,
  protectedBusinessIds: string[],
): string | null {
  if (showInactive) return null;
  const base = "customer_status.is.null,customer_status.neq.Inactive";
  if (protectedBusinessIds.length === 0) return base;
  // PostgREST .in.(...) accepts comma-separated UUIDs. UUIDs are
  // hyphen-safe and don't need quoting.
  return `${base},business_id.in.(${protectedBusinessIds.join(",")})`;
}

/**
 * Fetch dispositions for a given set of business_ids in one query and
 * return a Map<business_id, BusinessDisposition>. RLS scopes to the current
 * customer. Used to enrich each returned DashboardRecord with the full
 * disposition row after the main page fetch.
 *
 * Includes ALL dispositioned statuses (not just the protected set) — the
 * card UI may want to render an indicator for `skip` too even though skip
 * doesn't trigger the override.
 */
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
    console.error("[fetchDispositionsByBusinessId] query failed:", error);
    return out;
  }
  for (const r of (data ?? []) as BusinessDisposition[]) {
    out.set(r.business_id, r);
  }
  return out;
}

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

  // Task 4: dispositioned-records-always-visible. Fetch the customer's
  // protected business_ids first so the customer_status hide predicate can
  // OR them in. Empty list is fine — the OR-clause builder degrades to the
  // null-safe Inactive hide from Task 3.
  const protectedBusinessIds = filters.showInactive
    ? []
    : await fetchProtectedDispositionedBusinessIds();

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
      customer_status,
      notes,
      classified_at,
      issued_date,
      first_observed_at,
      sort_date,
      state_id,
      business_name,
      dba,
      businesses ( id, primary_legal_name, primary_dba_name, primary_state_code ),
      locations ( id, normalized_address, street, city, state_code, zip ),
      states ( state_code )
    `,
      { count: "planned" },
    )
    // Gate: only records Agent A has explicitly published. Prevents pre-publish
    // classifications from appearing to customers and is the standing rule for
    // all future classifier runs.
    .eq("published_to_customers", true);

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

  if (filters.newThisWeek) {
    // COALESCE(issued_date, first_observed_at) >= 7 days ago.
    // PostgREST can't express COALESCE in a filter, so we decompose:
    // issued_date present → compare issued_date; absent → compare first_observed_at.
    const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dateStr = threshold.toISOString().slice(0, 10); // YYYY-MM-DD for date column
    const tsStr = threshold.toISOString();
    query = query.or(
      `issued_date.gte.${dateStr},and(issued_date.is.null,first_observed_at.gte.${tsStr})`,
    );
  }

  const customerStatusOr = buildCustomerStatusOrClause(
    filters.showInactive,
    protectedBusinessIds,
  );
  if (customerStatusOr) {
    // Null-safe Inactive hide (Task 3) unioned with the protected-
    // disposition override (Task 4). PostgREST .neq doesn't match NULL
    // under three-valued logic, so .is.null is load-bearing; without it
    // most rows disappear during jurisdiction rollout when customer_status
    // is largely NULL. Each .or() call is its own AND-joined group, so
    // this composes cleanly with the cursor .or() below.
    query = query.or(customerStatusOr);
  }

  // StatusTabs filter axis. "all" = no predicate. "uncontacted" =
  // business_id NOT IN any-dispositioned-set. Specific status =
  // business_id IN that-status-set; empty set short-circuits to no
  // results.
  if (filters.dispositionTab !== "all") {
    if (filters.dispositionTab === "uncontacted") {
      const dispositionedIds =
        await fetchBusinessIdsByDispositionStatus("any");
      if (dispositionedIds.length > 0) {
        query = query.not(
          "business_id",
          "in",
          `(${dispositionedIds.join(",")})`,
        );
      }
    } else {
      const tabIds = await fetchBusinessIdsByDispositionStatus(
        filters.dispositionTab,
      );
      if (tabIds.length === 0) {
        return { records: [], nextCursor: null, totalCount: 0 };
      }
      query = query.in("business_id", tabIds);
    }
  }

  // -- Sort + cursor --

  const ascending = filters.sort === "oldest_first";
  // sort_date is a generated column: COALESCE(issued_date::timestamptz, first_observed_at).
  // Always non-null (first_observed_at is backfilled on every row), so no NULLS LAST needed,
  // but kept for safety against any future rows where first_observed_at is absent.
  query = query
    .order("sort_date", { ascending, nullsFirst: false })
    .order("id", { ascending });

  if (cursor) {
    // Composite cursor on (sort_date, id). cursor.s = sort_date ISO timestamp.
    if (ascending) {
      query = query.or(
        `sort_date.gt.${cursor.s},and(sort_date.eq.${cursor.s},id.gt.${cursor.i})`,
      );
    } else {
      query = query.or(
        `sort_date.lt.${cursor.s},and(sort_date.eq.${cursor.s},id.lt.${cursor.i})`,
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
    Omit<DashboardRecord, "business" | "location" | "state_code" | "data_source_channel" | "dba_name"> & {
      dba: string | null;
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
    customer_status: r.customer_status,
    disposition: null,
    notes: r.notes,
    classified_at: r.classified_at,
    issued_date: r.issued_date ?? null,
    first_observed_at: r.first_observed_at ?? null,
    sort_date: r.sort_date ?? null,
    state_id: r.state_id,
    state_code: r.states?.state_code ?? null,
    // Reserved column — null until Agent A adds classified_records.data_source_channel
    data_source_channel: null,
    business_name: r.business_name ?? null,
    dba_name: r.dba ?? null,
    business: r.businesses,
    location: r.locations,
  }));

  // Enrich with the full disposition row. One extra query keyed by the
  // page's distinct business_ids; null for any record whose parent business
  // has no disposition row.
  const pageBusinessIds = Array.from(
    new Set(records.map((r) => r.business?.id).filter((id): id is string => Boolean(id))),
  );
  const dispositionByBusinessId =
    await fetchDispositionsByBusinessId(pageBusinessIds);
  for (const record of records) {
    const bid = record.business?.id;
    if (bid) {
      record.disposition = dispositionByBusinessId.get(bid) ?? null;
    }
  }

  const hasMore = rows.length > PAGE_SIZE;
  const last = records[records.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          s: last.sort_date ?? last.classified_at,
          i: last.id,
        })
      : null;

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
    .select("id, email, status, current_tier, account_type")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // Internal accounts don't surface trial countdowns — they have no trial.
  if (customer?.account_type === "internal") {
    return {
      customerId: customer.id,
      email: customer.email ?? user.email ?? null,
      status: customer.status ?? null,
      currentTier: customer.current_tier ?? null,
      trialExpiresAt: null,
    };
  }

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Internal accounts see all sellable states (no customer_states rows exist
  // for them; customer_accessible_state_ids() handles RLS via the DB function,
  // but this list populates the state filter dropdown separately).
  const { data: customer } = await supabase
    .from("customers")
    .select("account_type")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (customer?.account_type === "internal") {
    const { data: states, error } = await supabase
      .from("states_active_for_sale")
      .select("state_code")
      .order("state_code");
    if (error) return [];
    return (states ?? [])
      .map((s: { state_code: string | null }) => s.state_code)
      .filter((s): s is string => Boolean(s));
  }

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

/**
 * Fetch up to `limit` records matching the given filters for CSV export.
 * Same join + filter + sort as fetchDashboardPage, but no cursor — exports
 * pull a single bounded batch. RLS scopes to the customer's accessible
 * states.
 *
 * Returns up to `limit` rows; caller is responsible for enforcing the
 * trial-vs-paid cap before calling.
 */
export async function fetchAllRecordsForExport(args: {
  filters: FilterState;
  limit: number;
}): Promise<DashboardRecord[]> {
  if (args.limit <= 0) return [];

  const supabase = await createClient();
  const { filters } = args;

  // Task 4: same protected-dispositions override as the page query — exports
  // include dispositioned-Inactive records that the rep would see on screen.
  const protectedBusinessIds = filters.showInactive
    ? []
    : await fetchProtectedDispositionedBusinessIds();

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
      customer_status,
      notes,
      classified_at,
      issued_date,
      first_observed_at,
      sort_date,
      state_id,
      business_name,
      dba,
      businesses ( id, primary_legal_name, primary_dba_name, primary_state_code ),
      locations ( id, normalized_address, street, city, state_code, zip ),
      states ( state_code )
    `,
    )
    .eq("published_to_customers", true);

  if (filters.states.length > 0) {
    const { data: stateRows } = await supabase
      .from("states")
      .select("id, state_code")
      .in("state_code", filters.states);
    const stateIds = (stateRows ?? []).map((r) => r.id);
    if (stateIds.length === 0) return [];
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

  if (filters.newThisWeek) {
    const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dateStr = threshold.toISOString().slice(0, 10);
    const tsStr = threshold.toISOString();
    query = query.or(
      `issued_date.gte.${dateStr},and(issued_date.is.null,first_observed_at.gte.${tsStr})`,
    );
  }

  const customerStatusOr = buildCustomerStatusOrClause(
    filters.showInactive,
    protectedBusinessIds,
  );
  if (customerStatusOr) {
    query = query.or(customerStatusOr);
  }

  // Same StatusTabs filter as the page query — exports match what the
  // rep sees on screen for the currently selected tab.
  if (filters.dispositionTab !== "all") {
    if (filters.dispositionTab === "uncontacted") {
      const dispositionedIds =
        await fetchBusinessIdsByDispositionStatus("any");
      if (dispositionedIds.length > 0) {
        query = query.not(
          "business_id",
          "in",
          `(${dispositionedIds.join(",")})`,
        );
      }
    } else {
      const tabIds = await fetchBusinessIdsByDispositionStatus(
        filters.dispositionTab,
      );
      if (tabIds.length === 0) return [];
      query = query.in("business_id", tabIds);
    }
  }

  const ascending = filters.sort === "oldest_first";
  query = query
    .order("sort_date", { ascending, nullsFirst: false })
    .order("id", { ascending })
    .limit(args.limit);

  const { data, error } = await query;
  if (error) {
    throw new Error(`fetchAllRecordsForExport failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as Array<
    Omit<DashboardRecord, "business" | "location" | "state_code" | "data_source_channel" | "dba_name"> & {
      dba: string | null;
      businesses: DashboardRecord["business"];
      locations: DashboardRecord["location"];
      states: { state_code: string | null } | null;
    }
  >;

  const records: DashboardRecord[] = rows.map((r) => ({
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
    customer_status: r.customer_status,
    disposition: null,
    notes: r.notes,
    classified_at: r.classified_at,
    issued_date: r.issued_date ?? null,
    first_observed_at: r.first_observed_at ?? null,
    sort_date: r.sort_date ?? null,
    state_id: r.state_id,
    state_code: r.states?.state_code ?? null,
    data_source_channel: null,
    business_name: r.business_name ?? null,
    dba_name: r.dba ?? null,
    business: r.businesses,
    location: r.locations,
  }));

  // Enrich with the full disposition row — same pattern as fetchDashboardPage.
  // Even on a 10K export this is one cheap query against the customer's own
  // dispositions table (typically small).
  const exportBusinessIds = Array.from(
    new Set(records.map((r) => r.business?.id).filter((id): id is string => Boolean(id))),
  );
  const dispositionByBusinessId =
    await fetchDispositionsByBusinessId(exportBusinessIds);
  for (const record of records) {
    const bid = record.business?.id;
    if (bid) {
      record.disposition = dispositionByBusinessId.get(bid) ?? null;
    }
  }
  return records;
}

/**
 * Sum row_count across csv_export_log for the current customer. Used to
 * enforce the trial cumulative cap — every export they've already taken
 * counts against the 25 limit.
 *
 * RLS limits SELECT to the customer's own rows (migration 007), so the
 * SUM is automatically scoped. Returns 0 if no prior exports.
 */
export async function fetchCumulativeExportRowCount(
  customerId: string,
): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("csv_export_log")
    .select("row_count")
    .eq("customer_id", customerId);

  if (error) {
    throw new Error(`fetchCumulativeExportRowCount failed: ${error.message}`);
  }
  const rows = (data ?? []) as Array<{ row_count: number }>;
  return rows.reduce((sum, r) => sum + (r.row_count ?? 0), 0);
}

/**
 * Computes the customer's export quota state for the FeedFooter. Returns
 * tier (or null for trial), and for trial customers, the cumulative
 * counter + cap. Single query for the trial path; no extra fetch for
 * paid customers (cap is constant).
 */
export type ExportStatus = {
  /** True if the customer is on the free trial (no current_tier). */
  isTrial: boolean;
  /**
   * For trial customers: cumulative rows exported so far. Undefined for
   * paid customers (no cumulative limit).
   */
  alreadyExported?: number;
  /**
   * Trial: TRIAL_EXPORT_CUMULATIVE_CAP. Paid: PAID_EXPORT_MAX_ROWS.
   * Same constants the route handler uses.
   */
  cap: number;
  /** True if customer has any quota left. */
  canExport: boolean;
};

export async function fetchExportStatus(): Promise<ExportStatus> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { isTrial: false, cap: PAID_EXPORT_MAX_ROWS, canExport: false };
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id, current_tier, account_type")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!customer) {
    return { isTrial: false, cap: PAID_EXPORT_MAX_ROWS, canExport: false };
  }

  // Internal accounts: no trial cap, full export access (matches paid UX).
  if (customer.account_type === "internal") {
    return { isTrial: false, cap: PAID_EXPORT_MAX_ROWS, canExport: true };
  }

  if (customer.current_tier) {
    return { isTrial: false, cap: PAID_EXPORT_MAX_ROWS, canExport: true };
  }

  const alreadyExported = await fetchCumulativeExportRowCount(customer.id);
  return {
    isTrial: true,
    alreadyExported,
    cap: TRIAL_EXPORT_CUMULATIVE_CAP,
    canExport: alreadyExported < TRIAL_EXPORT_CUMULATIVE_CAP,
  };
}

/**
 * Fetch the current customer's saved filter views (max 20 by DB trigger).
 * RLS scopes to own rows. filter_config is normalized into FilterState
 * at read time — legacy seed shape and new shape both supported (see
 * normalizeFilterConfig).
 *
 * Defaults (is_default=true) come first, then user-saved alphabetically.
 * Defaults aren't visually special — that's a comment-level distinction
 * only — but ordering helps customers find the seeded ones first.
 */
export async function fetchSavedFilters(): Promise<SavedFilter[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_saved_filters")
    .select("id, name, is_default, filter_config")
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    console.error("[fetchSavedFilters] query failed:", error);
    return [];
  }

  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    is_default: boolean;
    filter_config: unknown;
  }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    is_default: r.is_default,
    filter_config: normalizeFilterConfig(r.filter_config),
  }));
}
