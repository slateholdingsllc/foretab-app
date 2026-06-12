import {
  type BusinessArchetype,
  DEFAULT_FILTER_STATE,
  type DispositionTab,
  type FilterState,
  type LicenseRecordType,
  type SignalStrength,
  type SortOrder,
} from "./types";

const VALID_DISPOSITION_TABS = new Set<DispositionTab>([
  "all",
  "uncontacted",
  "saved",
  "working",
  "won",
  "lost",
  "skip",
]);

/**
 * Shape of a row read from public.customer_saved_filters. The
 * filter_config jsonb column is normalized into a FilterState at read time
 * — historic rows (seeded by Task 11's trial.ts) used snake_case keys
 * (license_types, business_archetypes, date_range_days, sort_order) that
 * predate the FilterState type. We accept both on read; we ALWAYS write
 * the FilterState shape so going forward only one shape exists in the DB.
 */
export type SavedFilter = {
  id: string;
  name: string;
  is_default: boolean;
  filter_config: FilterState;
};

const VALID_LICENSE_TYPES = new Set<LicenseRecordType>([
  "new_issuance",
  "renewal",
  "transfer",
  "expiration",
  "suspension",
  "revocation",
  "application",
]);
const VALID_SIGNAL_STRENGTHS = new Set<SignalStrength>([
  "New",
  "Established",
  "Dormant",
]);
const VALID_BUSINESS_ARCHETYPES = new Set<BusinessArchetype>([
  "bar_tavern",
  "restaurant_full_service",
  "restaurant_quick_serve",
  "package_store",
  "grocery",
  "convenience",
  "hotel_lodging",
  "brewery",
  "winery",
  "distillery",
  "wholesaler",
  "importer",
  "club",
  "special_event",
  "other",
]);
const VALID_SORTS = new Set<SortOrder>(["newest_first", "oldest_first"]);
const VALID_DAYS_WINDOWS = new Set([7, 30, 90, 180, 365]);

function pickArray<T>(
  raw: unknown,
  valid: Set<T>,
  transform?: (v: string) => unknown,
): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const item of raw) {
    const candidate = transform && typeof item === "string" ? transform(item) : item;
    if (valid.has(candidate as T)) out.push(candidate as T);
  }
  return out;
}

/**
 * Normalize a filter_config payload into a strict FilterState. Accepts:
 *   - FilterState shape (new): states, licenseTypes, signalStrengths,
 *     businessArchetypes, daysWindow, sort
 *   - Legacy seed shape (Task 11 trial.ts): license_types, signal_strength,
 *     business_archetypes, date_range_days, sort_order, on_premises, etc.
 *
 * Unknown keys are silently dropped; invalid enum values are dropped.
 * Returns a complete FilterState — never null — so callers can safely
 * serialize it back to URL search params.
 */
export function normalizeFilterConfig(raw: unknown): FilterState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_FILTER_STATE };
  const r = raw as Record<string, unknown>;

  // States aren't a fixed enum (states get added/removed over time), so
  // normalize separately: accept any 2-letter A-Z code.
  const rawStates = Array.isArray(r.states)
    ? r.states
    : Array.isArray(r.state_codes)
      ? r.state_codes
      : [];
  const cleanStates = (rawStates as unknown[])
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.toUpperCase())
    .filter((s) => /^[A-Z]{2}$/.test(s));

  const licenseTypes = pickArray<LicenseRecordType>(
    r.licenseTypes ?? r.license_types,
    VALID_LICENSE_TYPES,
  );

  const signalStrengths = pickArray<SignalStrength>(
    r.signalStrengths ?? r.signal_strengths ?? r.signal_strength,
    VALID_SIGNAL_STRENGTHS,
  );

  const businessArchetypes = pickArray<BusinessArchetype>(
    r.businessArchetypes ?? r.business_archetypes,
    VALID_BUSINESS_ARCHETYPES,
  );

  const daysRaw = r.daysWindow ?? r.days_window ?? r.date_range_days;
  const daysWindow =
    typeof daysRaw === "number" && VALID_DAYS_WINDOWS.has(daysRaw)
      ? daysRaw
      : null;

  const sortRaw = r.sort ?? r.sort_order;
  const sort: SortOrder = (
    typeof sortRaw === "string" && VALID_SORTS.has(sortRaw as SortOrder)
      ? (sortRaw as SortOrder)
      : DEFAULT_FILTER_STATE.sort
  );

  // Legacy rows (seeded before Task 3) don't have showInactive — default
  // to false so they keep the sellable-cohort view they were saved against.
  const showInactive = r.showInactive === true || r.show_inactive === true;

  // Legacy rows (pre-disposition-wire) don't have dispositionTab — default
  // to "all" so old saved views keep their wide-open behavior.
  const dispositionTabRaw = r.dispositionTab ?? r.disposition_tab;
  const dispositionTab: DispositionTab =
    typeof dispositionTabRaw === "string" &&
    VALID_DISPOSITION_TABS.has(dispositionTabRaw as DispositionTab)
      ? (dispositionTabRaw as DispositionTab)
      : DEFAULT_FILTER_STATE.dispositionTab;

  return {
    states: cleanStates,
    licenseTypes,
    signalStrengths,
    businessArchetypes,
    daysWindow,
    sort,
    search: DEFAULT_FILTER_STATE.search,
    showInactive,
    dispositionTab,
    newThisWeek: DEFAULT_FILTER_STATE.newThisWeek,
    city: DEFAULT_FILTER_STATE.city,
    zip: DEFAULT_FILTER_STATE.zip,
  };
}

/**
 * Server-side name validation. Returns a normalized name or an error.
 * Centralized so the action and any future bulk-rename surface agree.
 */
export function validateSavedFilterName(
  raw: unknown,
): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof raw !== "string") {
    return { ok: false, error: "Name is required." };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Name can't be blank." };
  }
  if (trimmed.length > 50) {
    return { ok: false, error: "Name must be 50 characters or fewer." };
  }
  return { ok: true, name: trimmed };
}
