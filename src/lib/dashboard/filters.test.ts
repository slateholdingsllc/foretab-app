import { describe, it, expect } from "vitest";
import { parseFiltersFromSearchParams, serializeFiltersToSearchParams } from "./filters";
import { DEFAULT_FILTER_STATE } from "./types";

describe("parseFiltersFromSearchParams", () => {
  it("round-trip: serialize → parse produces same FilterState", () => {
    const state = {
      ...DEFAULT_FILTER_STATE,
      states: ["NY", "CA"],
      daysWindow: 30,
      sort: "name_asc" as const,
    };
    const params = serializeFiltersToSearchParams(state);
    const parsed = parseFiltersFromSearchParams(Object.fromEntries(params.entries()));
    expect(parsed.states).toEqual(["NY", "CA"]);
    expect(parsed.daysWindow).toBe(30);
    expect(parsed.sort).toBe("name_asc");
  });

  it("invalid enum values are rejected from licenseTypes", () => {
    const result = parseFiltersFromSearchParams({ types: "new_issuance,invalid_type,renewal" });
    expect(result.licenseTypes).toEqual(["new_issuance", "renewal"]);
  });

  it("invalid signal strength values are filtered out", () => {
    const result = parseFiltersFromSearchParams({ signal: "New,INVALID,Established" });
    expect(result.signalStrengths).toEqual(["New", "Established"]);
  });

  it("daysWindow whitelist: valid values pass through", () => {
    for (const v of [7, 30, 90, 180, 365]) {
      expect(parseFiltersFromSearchParams({ days: String(v) }).daysWindow).toBe(v);
    }
  });

  it("daysWindow whitelist: out-of-set value returns null", () => {
    expect(parseFiltersFromSearchParams({ days: "45" }).daysWindow).toBe(null);
    expect(parseFiltersFromSearchParams({ days: "0" }).daysWindow).toBe(null);
    expect(parseFiltersFromSearchParams({ days: "abc" }).daysWindow).toBe(null);
  });

  it("dispositionTab defaults to DEFAULT_FILTER_STATE.dispositionTab for unknown value", () => {
    const result = parseFiltersFromSearchParams({ tab: "invalid_tab" });
    expect(result.dispositionTab).toBe(DEFAULT_FILTER_STATE.dispositionTab);
  });

  it("dispositionTab defaults to 'all' when absent", () => {
    const result = parseFiltersFromSearchParams({});
    expect(result.dispositionTab).toBe("all");
  });

  it("state codes are uppercased and non-2-letter codes rejected", () => {
    const result = parseFiltersFromSearchParams({ states: "ny,CA,NY1,B,TEXAS" });
    expect(result.states).toEqual(["NY", "CA"]);
  });

  it("territory 'all' is default for unknown value", () => {
    const result = parseFiltersFromSearchParams({ territory: "unknown_value" });
    expect(result.filterTerritory).toBe("all");
  });

  it("territory valid values 'in' and 'out' pass through", () => {
    expect(parseFiltersFromSearchParams({ territory: "in" }).filterTerritory).toBe("in");
    expect(parseFiltersFromSearchParams({ territory: "out" }).filterTerritory).toBe("out");
  });
});

describe("serializeFiltersToSearchParams", () => {
  it("default state produces empty params", () => {
    const params = serializeFiltersToSearchParams(DEFAULT_FILTER_STATE);
    expect(params.toString()).toBe("");
  });

  it("omits 'all' dispositionTab and 'newest_first' sort", () => {
    const state = {
      ...DEFAULT_FILTER_STATE,
      dispositionTab: "all" as const,
      sort: "newest_first" as const,
    };
    const params = serializeFiltersToSearchParams(state);
    expect(params.has("tab")).toBe(false);
    expect(params.has("sort")).toBe(false);
  });

  it("serializes non-default sort", () => {
    const params = serializeFiltersToSearchParams({ ...DEFAULT_FILTER_STATE, sort: "name_asc" as const });
    expect(params.get("sort")).toBe("name_asc");
  });

  it("serializes non-default dispositionTab", () => {
    const params = serializeFiltersToSearchParams({ ...DEFAULT_FILTER_STATE, dispositionTab: "working" as const });
    expect(params.get("tab")).toBe("working");
  });
});
