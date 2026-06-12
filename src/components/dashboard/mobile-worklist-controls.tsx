"use client";

import { useState } from "react";
import { WorklistSearchBar } from "./worklist-search-bar";
import { ActiveFilterChips } from "./active-filter-chips";
import { MobileFilterSheet } from "./mobile-filter-sheet";
import { hasActiveFilters } from "@/lib/dashboard/filters";
import type { SavedFilter } from "@/lib/dashboard/saved-filters";
import type { FilterState } from "@/lib/dashboard/types";

/**
 * MobileWorklistControls — the sticky mobile control stack that surfaces the
 * search/filter/views tools the desktop sidebar + top bar hold.
 *
 * Layout (top → bottom): search field · [Filters button + active-filter
 * chips] row. The disposition StatusTabs row stays below this (owned by the
 * worklist page), and the records feed scrolls under that — nothing here
 * pushes records below the fold.
 *
 * MOBILE-ONLY: render this inside an `lg:hidden` wrapper, or it self-hides via
 * the `lg:hidden` on its root. The desktop sidebar FilterForm / top-bar
 * SavedFiltersMenu / inline WorklistSearchBar are untouched.
 *
 * Everything routes through the same URL-param model:
 *   - search → WorklistSearchBar (existing component, unchanged)
 *   - filters/views → MobileFilterSheet (serializeFiltersToSearchParams)
 *   - active chips → ActiveFilterChips (each removes one facet)
 */
export function MobileWorklistControls({
  filters,
  accessibleStateCodes,
  savedFilters,
  resultCount,
}: {
  filters: FilterState;
  accessibleStateCodes: string[];
  savedFilters: SavedFilter[];
  resultCount?: number;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  // Count narrowing facets for the Filters button badge (mirrors the
  // sidebar's notion of "active" — search + tab are not counted here).
  const activeCount =
    filters.states.length +
    filters.signalStrengths.length +
    filters.licenseTypes.length +
    filters.businessArchetypes.length +
    (filters.daysWindow !== null ? 1 : 0) +
    (filters.newThisWeek ? 1 : 0) +
    (filters.showInactive ? 1 : 0);

  return (
    <div className="lg:hidden">
      <div className="px-3 pt-2.5">
        <WorklistSearchBar filters={filters} />
      </div>

      <div className="flex items-center gap-2 px-3 pb-2.5">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-foreground px-3.5 py-2 text-[13px] font-semibold text-background"
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M7 12h10M11 18h2" />
          </svg>
          Filters
          {activeCount > 0 ? (
            <span className="rounded-full bg-background/25 px-1.5 font-mono text-[10px] leading-tight">
              {activeCount}
            </span>
          ) : null}
        </button>

        <ActiveFilterChips filters={filters} />
      </div>

      <MobileFilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        accessibleStateCodes={accessibleStateCodes}
        savedFilters={savedFilters}
        resultCount={resultCount}
      />
    </div>
  );
}

/** Re-export for callers that only need the "are any filters active" check. */
export { hasActiveFilters };
