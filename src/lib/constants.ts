/**
 * States Foretab does not operate in. Signup is gated against these per the
 * Phase 2 legal posture (see foretab-engine docs/pricing.md §11 + the legal
 * docs queued for publish). Customers must affirm a non-excluded business
 * state at signup.
 *
 * Hardcoded here (not derived from public.states.excluded) because:
 *   1. This list reflects CUSTOMER LOCATION restrictions, not data coverage.
 *      The states table's `excluded` column governs which states' data we sell.
 *      Those concepts overlap today by coincidence — keep them separated in
 *      code so we can diverge cleanly (e.g., serve customers in a state whose
 *      data we don't yet carry, or vice versa).
 *   2. Server-side validation needs this list before any DB call.
 */
export const EXCLUDED_BUSINESS_STATES = new Set(["CA", "WA", "TX", "VT", "OR"]);

export type StateOption = { code: string; name: string };

/**
 * All US states + DC. Used by the signup business-state dropdown. Sorted by
 * full name so the picker is alphabetical. Codes are 2-letter USPS.
 */
export const US_STATES_AND_DC: ReadonlyArray<StateOption> = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

export function isExcludedBusinessState(code: string): boolean {
  return EXCLUDED_BUSINESS_STATES.has(code.toUpperCase());
}

export function getStateName(code: string): string | undefined {
  return US_STATES_AND_DC.find((s) => s.code === code.toUpperCase())?.name;
}
