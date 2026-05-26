/**
 * Shared types for the dashboard scaffold (Task 12).
 *
 * DataSourceChannel is reserved for the per-record "channel" column that
 * gate item 5 (channel-discipline audit) requires. Not rendered in the
 * scaffold UI yet — see records.tsx; the column slot is present but
 * fed from `null` until Agent A adds `classified_records.data_source_channel`
 * (foretab-engine, not this PR).
 */

export type DataSourceChannel =
  | "socrata_api"
  | "pdf_parse"
  | "web_scrape"
  | "prr_request"
  | "foia_request";

export type SignalStrength = "hot" | "warm" | "cold";

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
  notes: string | null;
  classified_at: string; // ISO timestamp
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

export type SortOrder = "newest_first" | "oldest_first" | "signal_strength_desc";

export type FilterState = {
  states: string[]; // state codes the customer wants in scope, or [] = all accessible
  licenseTypes: LicenseRecordType[];
  signalStrengths: SignalStrength[];
  businessArchetypes: BusinessArchetype[];
  daysWindow: number | null; // null = all time; e.g., 7, 30, 90
  sort: SortOrder;
};

export const DEFAULT_FILTER_STATE: FilterState = {
  states: [],
  licenseTypes: [],
  signalStrengths: [],
  businessArchetypes: [],
  daysWindow: null,
  sort: "newest_first",
};

export const PAGE_SIZE = 50;

export type CursorPayload = {
  /** classified_at of the last record on the previous page (ISO timestamp) */
  c: string;
  /** id of the last record (tiebreaker for identical classified_at) */
  i: string;
};

export type PageResult = {
  records: DashboardRecord[];
  /** Cursor to fetch the next page, or null if no more rows. */
  nextCursor: string | null;
  /** Total count matching the filter (RLS-filtered). Expensive on large tables; capped to 10K. */
  totalCount: number | null;
};
