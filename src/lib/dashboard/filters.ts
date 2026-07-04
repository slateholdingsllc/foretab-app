import {
  type BusinessArchetype,
  DEFAULT_FILTER_STATE,
  type DispositionTab,
  type FilterState,
  type LeadType,
  type LicenseRecordType,
  type SignalStrength,
  type SortOrder,
} from "./types";

const VALID_TERRITORY_VALUES = ["all", "in", "out"] as const;
type TerritoryValue = (typeof VALID_TERRITORY_VALUES)[number];

function parseTerritory(raw: string | undefined): FilterState["filterTerritory"] {
  if (!raw) return DEFAULT_FILTER_STATE.filterTerritory;
  if ((VALID_TERRITORY_VALUES as readonly string[]).includes(raw)) return raw as TerritoryValue;
  return DEFAULT_FILTER_STATE.filterTerritory;
}

const VALID_DISPOSITION_TABS: DispositionTab[] = [
  "all",
  "uncontacted",
  "saved",
  "working",
  "won",
  "lost",
  "skip",
];

function parseDispositionTab(raw: string | undefined): DispositionTab {
  if (!raw) return DEFAULT_FILTER_STATE.dispositionTab;
  if ((VALID_DISPOSITION_TABS as string[]).includes(raw)) {
    return raw as DispositionTab;
  }
  return DEFAULT_FILTER_STATE.dispositionTab;
}

/**
 * URL search params <-> FilterState serialization. URL is the source of
 * truth: filter changes navigate to a new URL, server re-renders. No
 * client-side state to sync. Shareable, back-button works, no JS
 * required for the filter form to function.
 *
 * Param shape (comma-separated lists):
 *   ?states=NY,PA
 *   ?types=new_issuance,renewal
 *   ?signal=hot,warm
 *   ?archetype=restaurant_full_service,bar_tavern
 *   ?days=30
 *   ?sort=newest_first
 *   ?cursor=<base64url>
 */

const VALID_LICENSE_TYPES: LicenseRecordType[] = [
  "new_issuance",
  "renewal",
  "transfer",
  "expiration",
  "suspension",
  "revocation",
  "application",
];

const VALID_SIGNAL_STRENGTHS: SignalStrength[] = ["New", "Established", "Dormant"];

const VALID_BUSINESS_ARCHETYPES: BusinessArchetype[] = [
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
];

const VALID_SORTS: SortOrder[] = [
  "newest_first",
  "oldest_first",
  "name_asc",
  "name_desc",
  "issued_desc",
  "issued_asc",
  "expiring_soonest",
  "license_type_asc",
  "license_type_desc",
  "city_asc",
  "city_desc",
  "zip_asc",
];

const VALID_DAYS_WINDOWS = new Set([7, 30, 90, 180, 365]);

const VALID_LEAD_TYPES: LeadType[] = ["recurring", "event"];

function parseList<T extends string>(raw: string | undefined, valid: readonly T[]): T[] {
  if (!raw) return [];
  const validSet = new Set(valid);
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is T => validSet.has(s as T));
}

function parseStateList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length === 2 && /^[A-Z]{2}$/.test(s));
}

function parseDaysWindow(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return null;
  if (!VALID_DAYS_WINDOWS.has(n)) return null;
  return n;
}

function parseSort(raw: string | undefined): SortOrder {
  if (!raw) return DEFAULT_FILTER_STATE.sort;
  if ((VALID_SORTS as string[]).includes(raw)) return raw as SortOrder;
  return DEFAULT_FILTER_STATE.sort;
}

export function parseFiltersFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): FilterState {
  const get = (key: string): string | undefined => {
    const v = searchParams[key];
    if (Array.isArray(v)) return v[0];
    return v;
  };

  return {
    states: parseStateList(get("states")),
    licenseTypes: parseList(get("types"), VALID_LICENSE_TYPES),
    signalStrengths: parseList(get("signal"), VALID_SIGNAL_STRENGTHS),
    businessArchetypes: parseList(get("archetype"), VALID_BUSINESS_ARCHETYPES),
    daysWindow: parseDaysWindow(get("days")),
    sort: parseSort(get("sort")),
    search: get("q")?.trim() ?? "",
    showInactive: get("inactive") === "1",
    dispositionTab: parseDispositionTab(get("tab")),
    newThisWeek: get("ntw") === "1",
    city: get("city")?.trim() ?? "",
    zip: get("zip")?.trim() ?? "",
    leadTypes: parseList(get("lead"), VALID_LEAD_TYPES),
    filterTerritory: parseTerritory(get("territory")),
  };
}

/**
 * Serialize a filter state back into URL search params. Used by the
 * filter form to construct the new URL on submit. Omits empty values
 * so URLs stay short and readable.
 */
export function serializeFiltersToSearchParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.states.length > 0) params.set("states", filters.states.join(","));
  if (filters.licenseTypes.length > 0) params.set("types", filters.licenseTypes.join(","));
  if (filters.signalStrengths.length > 0) params.set("signal", filters.signalStrengths.join(","));
  if (filters.businessArchetypes.length > 0)
    params.set("archetype", filters.businessArchetypes.join(","));
  if (filters.daysWindow !== null) params.set("days", String(filters.daysWindow));
  if (filters.sort !== DEFAULT_FILTER_STATE.sort) params.set("sort", filters.sort);
  if (filters.search.length > 0) params.set("q", filters.search);
  if (filters.showInactive) params.set("inactive", "1");
  if (filters.dispositionTab !== DEFAULT_FILTER_STATE.dispositionTab) {
    params.set("tab", filters.dispositionTab);
  }
  if (filters.newThisWeek) params.set("ntw", "1");
  if (filters.city.length > 0) params.set("city", filters.city);
  if (filters.zip.length > 0) params.set("zip", filters.zip);
  if (filters.leadTypes.length > 0) params.set("lead", filters.leadTypes.join(","));
  if (filters.filterTerritory !== DEFAULT_FILTER_STATE.filterTerritory) {
    params.set("territory", filters.filterTerritory);
  }
  return params;
}

/**
 * Detects whether any filter is non-default — used to decide whether to
 * show a "Clear filters" link AND to pick the empty-state copy
 * ("no matches" vs "no records exist").
 *
 * showInactive intentionally NOT counted — it broadens results rather
 * than narrowing, so an empty page with showInactive=true is still
 * "no records," not "no matches." The Clear button in FilterForm handles
 * showInactive inline.
 *
 * dispositionTab IS counted — non-"all" values narrow.
 */
export function hasActiveFilters(filters: FilterState): boolean {
  return (
    filters.states.length > 0 ||
    filters.licenseTypes.length > 0 ||
    filters.signalStrengths.length > 0 ||
    filters.businessArchetypes.length > 0 ||
    filters.daysWindow !== null ||
    filters.sort !== DEFAULT_FILTER_STATE.sort ||
    filters.search.length > 0 ||
    filters.dispositionTab !== DEFAULT_FILTER_STATE.dispositionTab ||
    filters.newThisWeek ||
    filters.city.length > 0 ||
    filters.zip.length > 0 ||
    filters.leadTypes.length > 0 ||
    filters.filterTerritory !== DEFAULT_FILTER_STATE.filterTerritory
  );
}
