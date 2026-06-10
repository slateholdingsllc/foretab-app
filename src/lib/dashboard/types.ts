/**
 * Shared types for the dashboard scaffold (Task 12).
 *
 * DataSourceChannel is reserved for the per-record "channel" column that
 * gate item 5 (channel-discipline audit) requires. Not rendered in the
 * scaffold UI yet — see records.tsx; the column slot is present but
 * fed from `null` until Agent A adds `classified_records.data_source_channel`
 * (foretab-engine, not this PR).
 */

import type {
  BusinessDisposition,
  DispositionStatus,
} from "@/lib/disposition/types";

export type DataSourceChannel =
  | "socrata_api"
  | "pdf_parse"
  | "web_scrape"
  | "prr_request"
  | "foia_request";

/**
 * Pinned to Agent A's v2 classification vocabulary per
 * 20260528000001_signal_strength_rename.sql. Verified 2026-05-29: zero v1
 * (hot/warm/cold) rows remain in classified_records. Mirrors
 * `disposition/types.ts` SignalStrength — single source of truth across
 * the dashboard read path and the disposition data layer.
 *
 * Semantic mapping vs the v1 pack (for archaeology):
 *   New          high-intent freshly-classified signal (was: hot)
 *   Established  proven-pattern signal              (was: warm)
 *   Dormant      inactive / cold                    (was: cold)
 *
 * Display label = the value itself (already display-grade), so SignalBadge
 * renders the value directly and maps to a Badge variant separately.
 */
export type SignalStrength = "New" | "Established" | "Dormant";

export type LicenseRecordType =
  | "new_issuance"
  | "renewal"
  | "transfer"
  | "expiration"
  | "suspension"
  | "revocation"
  | "application";

export type BusinessArchetype =
  | "bar_tavern"
  | "restaurant_full_service"
  | "restaurant_quick_serve"
  | "package_store"
  | "grocery"
  | "convenience"
  | "hotel_lodging"
  | "brewery"
  | "winery"
  | "distillery"
  | "wholesaler"
  | "importer"
  | "club"
  | "special_event"
  | "other";

export type BeverageScope =
  | "beer_only"
  | "beer_wine"
  | "wine_only"
  | "full_liquor"
  | "spirits_only"
  | "unknown";

/**
 * Per-record current-state bucket set by Agent A's classifier on
 * classified_records.customer_status. Distinct from license_record_type
 * (the event) — this is the license's CURRENT state.
 *
 * Default view (showInactive=false) hides "Inactive" rows but keeps NULL
 * visible — most rows will be NULL during jurisdiction rollout and
 * dropping them would empty the dashboard.
 */
export type CustomerStatus = "Active" | "Pending" | "Suspended" | "Inactive";

/**
 * Disposition statuses that override the customer_status hide predicate.
 * Records dispositioned with one of these statuses stay visible regardless
 * of customer_status — so a lead the rep is actively pursuing never silently
 * vanishes when its license flips to Inactive.
 *
 * `skip` is deliberately excluded: it's the rep's explicit "I don't want
 * this" — forcing skipped records to stay visible would defeat the intent.
 * Skipped records still surface in the disposition layer's Skipped tab.
 *
 * `uncontacted` is also excluded — it's the implicit no-row default, so a
 * record with no disposition is not "protected".
 */
export const PROTECTED_DISPOSITION_STATUSES = [
  "saved",
  "working",
  "won",
  "lost",
] as const satisfies ReadonlyArray<DispositionStatus>;

export type ProtectedDispositionStatus =
  (typeof PROTECTED_DISPOSITION_STATUSES)[number];

/**
 * Shape returned by the dashboard query (joined view across
 * classified_records + businesses + locations + states). All joins are
 * LEFT JOINs because dedup may not have populated business_id /
 * location_id yet for a given record.
 */
export type DashboardRecord = {
  id: string;
  classification_version: string;
  license_record_type: LicenseRecordType | null;
  icp_relevance: string[];
  business_archetype: BusinessArchetype | null;
  on_premises: boolean | null;
  off_premises: boolean | null;
  beverage_scope: BeverageScope | null;
  signal_strength: SignalStrength | null;
  signal_strength_reason: string | null;
  customer_status: CustomerStatus | null;
  /**
   * Current customer's disposition row for this record's parent business,
   * or null if uncontacted (no row). Joined in-app from
   * customer_business_disposition, not via PostgREST embed (that table is
   * RLS-scoped to current_customer_id() and doesn't embed cleanly from
   * classified_records). Carries the full row so DispositionRow / DetailPanel
   * can render notes / follow-ups / last-touch without a second lookup per
   * card.
   */
  disposition: BusinessDisposition | null;
  notes: string | null;
  classified_at: string; // ISO timestamp
  /** YYYY-MM-DD, or null when the state doesn't provide issue dates (CO, MO permanently; CT/NV partially) */
  issued_date: string | null;
  /** ISO timestamp; always populated — backfilled from raw_records.created_at for pre-backfill rows */
  first_observed_at: string | null;
  state_id: string;
  state_code: string | null;
  /** Reserved for the channel-discipline audit column. Always null until Agent A adds the column. */
  data_source_channel: DataSourceChannel | null;
  business: {
    id: string;
    primary_legal_name: string | null;
    primary_dba_name: string | null;
    primary_state_code: string | null;
  } | null;
  location: {
    id: string;
    normalized_address: string | null;
    street: string | null;
    city: string | null;
    state_code: string | null;
    zip: string | null;
  } | null;
};

export type SortOrder = "newest_first" | "oldest_first";

/**
 * StatusTabs filter axis. Mirrors the StatusTabValue type from
 * components/dashboard/disposition/status-tabs.tsx (DispositionStatus | "all")
 * — inlined here to avoid circular type imports between the dashboard data
 * layer and the disposition component layer.
 */
export type DispositionTab = DispositionStatus | "all";

export type FilterState = {
  states: string[]; // state codes the customer wants in scope, or [] = all accessible
  licenseTypes: LicenseRecordType[];
  signalStrengths: SignalStrength[];
  businessArchetypes: BusinessArchetype[];
  daysWindow: number | null; // null = all time; e.g., 7, 30, 90
  sort: SortOrder;
  /**
   * When false (default), the query hides records with customer_status =
   * 'Inactive'. NULL rows remain visible regardless. When true, no
   * customer_status predicate is applied.
   */
  showInactive: boolean;
  /**
   * Active StatusTabs selection. "all" = no disposition predicate.
   * "uncontacted" = records whose business has no disposition row. Any
   * other DispositionStatus = records whose business has a disposition
   * with that exact status.
   */
  dispositionTab: DispositionTab;
  /**
   * When true, filters to records where COALESCE(issued_date, first_observed_at)
   * is within the last 7 days. Uses PostgREST OR: issued_date >= threshold
   * OR (issued_date IS NULL AND first_observed_at >= threshold).
   */
  newThisWeek: boolean;
};

export const DEFAULT_FILTER_STATE: FilterState = {
  states: [],
  licenseTypes: [],
  signalStrengths: [],
  businessArchetypes: [],
  daysWindow: null,
  sort: "newest_first",
  showInactive: false,
  dispositionTab: "all",
  newThisWeek: false,
};

export const PAGE_SIZE = 50;

/**
 * Per-state health entry used by the freshness UI. One row per state in
 * the customer's accessible set. Keyed by state_id in the map exposed
 * by fetchDataSourceHealthMap().
 */
export type StateHealthEntry = {
  state_id: string;
  state_code: string | null;
  refresh_frequency: string | null;
  last_refresh_at: string | null;
  /** Operator-set: green / yellow / red / unknown */
  status: string | null;
  error_count_24h: number | null;
};

export type StateHealthMap = Map<string, StateHealthEntry>;

export type CursorPayload = {
  /**
   * issued_date of the last record (YYYY-MM-DD), or null when the record
   * has no issued_date and sorted in the first_observed_at fallback zone.
   */
  d: string | null;
  /** first_observed_at ISO timestamp (always populated; tiebreaker for null-issued zone) */
  f: string;
  /** id tiebreaker for identical (d, f) pairs */
  i: string;
};

export type PageResult = {
  records: DashboardRecord[];
  /** Cursor to fetch the next page, or null if no more rows. */
  nextCursor: string | null;
  /** Total count matching the filter (RLS-filtered). Expensive on large tables; capped to 10K. */
  totalCount: number | null;
};
