/**
 * Flat return type matching Agent A's feed_record composite type (31 columns).
 *
 * Verified against pg_type/pg_attribute 2026-06-13. Notable deltas vs the
 * original Phase 0 proposal:
 *
 *   NOT returned by RPC (handle in mapper with fallbacks):
 *     classification_version  — hardcode "2"; all published records are post-v1
 *     signal_strength_reason  — null
 *     notes                   — null (operator notes, not surfaced to customers)
 *     state_code              — derive from state_id via states lookup in caller
 *     location_state_code     — derive from state_id (same map)
 *
 *   Returned by RPC but not in DashboardRecord (accepted, no consumer yet):
 *     phone, email, contact_name, mailing_address, effective_date,
 *     created_at, updated_at
 *
 * The search filter in get_feed also matches location_city (broader than the
 * direct PostgREST path, which only matches business_name + dba). Noted but
 * no action required — more results is acceptable parity.
 */
export type RawFeedRecord = {
  // Identity
  id: string;
  state_id: string;
  business_id: string | null;
  location_id: string | null;

  // Classification
  license_record_type: string | null;
  icp_relevance: string[] | null;
  business_archetype: string | null;
  on_premises: boolean | null;
  off_premises: boolean | null;
  beverage_scope: string | null;
  signal_strength: string | null;
  customer_status: string | null;

  // Contact fields (returned by RPC, not yet in DashboardRecord)
  phone: string | null;
  email: string | null;
  contact_name: string | null;
  mailing_address: string | null;

  // Dates
  issued_date: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  sort_date: string | null;
  first_observed_at: string | null;
  classified_at: string;
  created_at: string;
  updated_at: string;

  // License
  license_type_raw: string | null;

  // Denormalized names — COALESCE(businesses.primary_*, cr.*)
  business_name: string | null;
  dba: string | null;

  // Lead type (migration 000003 by Agent A)
  lead_type: string | null;

  // Denormalized location columns on classified_records
  location_city: string | null;
  location_zip: string | null;

  // From locations LEFT JOIN (flat)
  location_street: string | null;
  location_normalized_address: string | null;
};
