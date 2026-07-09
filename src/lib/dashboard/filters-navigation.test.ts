/**
 * Filter URL state-machine invariants.
 *
 * These tests cover the navigation contract that kept breaking in production:
 * URL is the single source of truth, so serialize(parse(url)) must round-trip,
 * chip removal must produce the right URL, preset switches must preserve the
 * right context, and the export link must reflect on-screen filters exactly.
 *
 * No DOM or router — just the pure parse/serialize functions.
 */
import { describe, expect, it } from "vitest";
import {
  hasActiveFilters,
  parseFiltersFromSearchParams,
  serializeFiltersToSearchParams,
} from "./filters";
import { DEFAULT_FILTER_STATE } from "./types";
import type { FilterState } from "./types";

/** Simulate a URL navigation: serialize filters → parse the resulting URL. */
function navigate(filters: FilterState): FilterState {
  const params = serializeFiltersToSearchParams(filters);
  return parseFiltersFromSearchParams(Object.fromEntries(params.entries()));
}

/** Parse a raw query string (without leading ?) into FilterState. */
function fromQs(qs: string): FilterState {
  return parseFiltersFromSearchParams(Object.fromEntries(new URLSearchParams(qs).entries()));
}

// ---------------------------------------------------------------------------
// 1. Apply filter → URL contains it → parse(URL) === applied state
// ---------------------------------------------------------------------------
describe("apply filter → URL → parse round-trip", () => {
  it("state filter survives round-trip", () => {
    const state: FilterState = { ...DEFAULT_FILTER_STATE, states: ["NY"] };
    const parsed = navigate(state);
    expect(parsed.states).toEqual(["NY"]);
  });

  it("licenseTypes filter survives round-trip", () => {
    const state: FilterState = {
      ...DEFAULT_FILTER_STATE,
      licenseTypes: ["new_issuance", "application"],
    };
    const parsed = navigate(state);
    expect(parsed.licenseTypes).toEqual(["new_issuance", "application"]);
  });

  it("daysWindow survives round-trip", () => {
    const state: FilterState = { ...DEFAULT_FILTER_STATE, daysWindow: 90 };
    expect(navigate(state).daysWindow).toBe(90);
  });

  it("Opening Now canonical URL parses to correct filter state", () => {
    const parsed = fromQs("types=new_issuance,application&days=180");
    expect(parsed.licenseTypes).toContain("new_issuance");
    expect(parsed.licenseTypes).toContain("application");
    expect(parsed.daysWindow).toBe(180);
  });

  it("bare URL (no params) parses to empty filter state — all records all-time", () => {
    const parsed = parseFiltersFromSearchParams({});
    expect(parsed.licenseTypes).toHaveLength(0);
    expect(parsed.daysWindow).toBeNull();
    expect(parsed.states).toHaveLength(0);
    expect(hasActiveFilters(parsed)).toBe(false);
  });

  it("serialize(Opening Now filters) produces canonical URL", () => {
    const filters: FilterState = {
      ...DEFAULT_FILTER_STATE,
      licenseTypes: ["new_issuance", "application"],
      daysWindow: 180,
    };
    const params = serializeFiltersToSearchParams(filters);
    expect(params.get("types")).toBe("new_issuance,application");
    expect(params.get("days")).toBe("180");
  });
});

// ---------------------------------------------------------------------------
// 2. Preset switch preserves untouched filters
// ---------------------------------------------------------------------------
describe("preset switch preserves untouched filters", () => {
  it("All Records preset: clears types + days but preserves state filter", () => {
    const current: FilterState = {
      ...DEFAULT_FILTER_STATE,
      states: ["NY"],
      licenseTypes: ["new_issuance", "application"],
      daysWindow: 180,
    };
    // Simulates clicking "All Records" in saved-filters-menu which clears
    // licenseTypes, daysWindow, newThisWeek but keeps states.
    const allRecords: FilterState = {
      ...current,
      licenseTypes: [],
      daysWindow: null,
      newThisWeek: false,
    };
    const afterSwitch = navigate(allRecords);
    expect(afterSwitch.states).toEqual(["NY"]);
    expect(afterSwitch.licenseTypes).toHaveLength(0);
    expect(afterSwitch.daysWindow).toBeNull();
  });

  it("Opening Now preset: canonical URL always carries types + days", () => {
    // The Opening Now preset links to a fixed URL — it doesn't preserve
    // states (by design). Verify the canonical URL round-trips correctly.
    const openingNow = fromQs("types=new_issuance,application&days=180");
    expect(openingNow.licenseTypes).toEqual(["new_issuance", "application"]);
    expect(openingNow.daysWindow).toBe(180);
    expect(openingNow.states).toHaveLength(0); // canonical URL has no state filter
  });

  it("switching window inside Opening Now preserves types filter", () => {
    const current: FilterState = {
      ...DEFAULT_FILTER_STATE,
      licenseTypes: ["new_issuance", "application"],
      daysWindow: 180,
    };
    // User clicks "30d" chip in OpeningNowBar — sets days=30, keeps types.
    const narrowed: FilterState = { ...current, daysWindow: 30 };
    const afterSwitch = navigate(narrowed);
    expect(afterSwitch.licenseTypes).toEqual(["new_issuance", "application"]);
    expect(afterSwitch.daysWindow).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// 3. Back button: previous URL state === parse(previous URL)
// ---------------------------------------------------------------------------
describe("back button state === previous URL state", () => {
  it("going back to prior URL gives same filter state as original parse", () => {
    const urlA = "states=NY&types=new_issuance,application&days=180";
    const urlB = "states=NY&types=new_issuance,application&days=30";
    const stateA = fromQs(urlA);
    // navigate to B, then go back to A
    fromQs(urlB); // mutate nothing — just consume
    const backToA = fromQs(urlA);
    expect(backToA).toEqual(stateA);
  });

  it("parse is deterministic — same URL always gives same state", () => {
    const url = "states=NY,PA&types=new_issuance&days=90&signal=New";
    expect(fromQs(url)).toEqual(fromQs(url));
  });
});

// ---------------------------------------------------------------------------
// 4. Refresh: re-parse same URL === same state
// ---------------------------------------------------------------------------
describe("refresh: re-parse same URL === same state", () => {
  it("Opening Now URL is stable across reloads", () => {
    const state1 = fromQs("types=new_issuance,application&days=180");
    const state2 = fromQs("types=new_issuance,application&days=180");
    expect(state1).toEqual(state2);
  });

  it("complex filter URL is stable across reloads", () => {
    const url = "states=NY&types=new_issuance,renewal&days=30&signal=New,Established";
    expect(fromQs(url)).toEqual(fromQs(url));
  });
});

// ---------------------------------------------------------------------------
// 5. Export link href filters === on-screen filters
// ---------------------------------------------------------------------------
describe("export link href === on-screen filters", () => {
  it("export URL carries the same state/type/days as the current view", () => {
    const viewFilters: FilterState = {
      ...DEFAULT_FILTER_STATE,
      states: ["NY"],
      licenseTypes: ["new_issuance", "application"],
      daysWindow: 180,
    };
    // page.tsx builds: serializeFiltersToSearchParams(filters) → export URL
    const exportParams = serializeFiltersToSearchParams(viewFilters);
    // Parsing the export URL back gives the same filters the view is using.
    const exportFilters = parseFiltersFromSearchParams(Object.fromEntries(exportParams.entries()));
    expect(exportFilters.states).toEqual(viewFilters.states);
    expect(exportFilters.licenseTypes).toEqual(viewFilters.licenseTypes);
    expect(exportFilters.daysWindow).toBe(viewFilters.daysWindow);
  });

  it("no invisible injection: export URL for Opening Now view carries types param", () => {
    const openingNowFilters: FilterState = {
      ...DEFAULT_FILTER_STATE,
      licenseTypes: ["new_issuance", "application"],
      daysWindow: 180,
    };
    const exportParams = serializeFiltersToSearchParams(openingNowFilters);
    // Previously the export URL was built from `filters` which had invisible
    // injection — the export carried types/days that weren't in the URL.
    // Now filter state IS the URL, so the export URL must match.
    expect(exportParams.get("types")).toBe("new_issuance,application");
    expect(exportParams.get("days")).toBe("180");
  });
});

// ---------------------------------------------------------------------------
// 6. Removing every chip → All Records all-time; reverse path re-applies
// ---------------------------------------------------------------------------
describe("chip removal → all records; re-apply reverses cleanly", () => {
  const start: FilterState = {
    ...DEFAULT_FILTER_STATE,
    states: ["NY"],
    licenseTypes: ["new_issuance", "application"],
    daysWindow: 180,
  };

  it("remove state chip: state gone, types/days preserved", () => {
    const after = navigate({ ...start, states: [] });
    expect(after.states).toHaveLength(0);
    expect(after.licenseTypes).toEqual(["new_issuance", "application"]);
    expect(after.daysWindow).toBe(180);
  });

  it("remove one licenseType chip: remaining types preserved", () => {
    const after = navigate({
      ...start,
      licenseTypes: start.licenseTypes.filter((t) => t !== "application"),
    });
    expect(after.licenseTypes).toEqual(["new_issuance"]);
    expect(after.daysWindow).toBe(180);
  });

  it("remove all licenseType chips: empty types, days still set", () => {
    const after = navigate({ ...start, licenseTypes: [] });
    expect(after.licenseTypes).toHaveLength(0);
    expect(after.daysWindow).toBe(180);
  });

  it("remove days chip: no time window — all-time view", () => {
    const after = navigate({ ...start, licenseTypes: [], states: [], daysWindow: null });
    expect(after.daysWindow).toBeNull();
    expect(after.licenseTypes).toHaveLength(0);
    expect(hasActiveFilters(after)).toBe(false);
  });

  it("removing all chips produces default (empty) filter state", () => {
    const noChips: FilterState = {
      ...DEFAULT_FILTER_STATE,
      states: [],
      licenseTypes: [],
      daysWindow: null,
    };
    const after = navigate(noChips);
    expect(hasActiveFilters(after)).toBe(false);
    expect(after.states).toHaveLength(0);
    expect(after.licenseTypes).toHaveLength(0);
    expect(after.daysWindow).toBeNull();
  });

  it("re-applying state after clear gives same state as original", () => {
    // Simulates: remove all chips → re-apply via filter form
    const cleared: FilterState = { ...DEFAULT_FILTER_STATE };
    const reapplied: FilterState = { ...cleared, states: ["NY"] };
    expect(navigate(reapplied).states).toEqual(["NY"]);
  });

  it("full round-trip: start → clear → re-apply → same as start", () => {
    const cleared: FilterState = { ...DEFAULT_FILTER_STATE };
    const reapplied: FilterState = {
      ...cleared,
      states: start.states,
      licenseTypes: start.licenseTypes,
      daysWindow: start.daysWindow,
    };
    const final = navigate(reapplied);
    expect(final.states).toEqual(start.states);
    expect(final.licenseTypes).toEqual(start.licenseTypes);
    expect(final.daysWindow).toBe(start.daysWindow);
  });
});
