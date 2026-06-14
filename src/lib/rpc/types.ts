/**
 * Flat return type from Agent A's feed_record composite type.
 *
 * Mirrors classified_records scalar columns plus flat location_* and
 * state_code from the internal JOINs. Two fields are new vs. the
 * direct-PostgREST path: location_street and location_normalized_address
 * (previously buried in the embedded locations object, now top-level).
 *
 * business_name and dba are COALESCE'd with businesses.primary_legal_name /
 * primary_dba_name by the RPC — same field names, better values once
 * entity resolution has run.
 */
export type RawFeedRecord = {
  // classified_records scalar columns
  id: string;
  classification_version: string;
  license_record_type: string | null;
  icp_relevance: string[] | null;
  business_archetype: string | null;
  on_premises: boolean | null;
  off_premises: boolean | null;
  beverage_scope: string | null;
  signal_strength: string | null;
  signal_strength_reason: string | null;
  customer_status: string | null;
  notes: string | null;
  classified_at: string;
  issued_date: string | null;
  first_observed_at: string | null;
  sort_date: string | null;
  state_id: string;
  business_id: string | null;
  business_name: string | null; // COALESCE(businesses.primary_legal_name, cr.business_name)
  dba: string | null; // COALESCE(businesses.primary_dba_name, cr.dba)
  expiration_date: string | null;
  license_type_raw: string | null;
  // denormalized location columns on classified_records
  location_city: string | null;
  location_zip: string | null;
  // from states JOIN
  state_code: string | null;
  // from locations JOIN (flat)
  location_id: string | null;
  location_street: string | null; // NEW
  location_normalized_address: string | null; // NEW
  location_state_code: string | null;
};
