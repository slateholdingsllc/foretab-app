import { hasActiveFilters } from "@/lib/dashboard/filters";
import type { FilterState, PageResult, StateHealthMap } from "@/lib/dashboard/types";
import { CursorPagination } from "./cursor-pagination";
import { EmptyState } from "./empty-state";
import { FeedFooter } from "./feed-footer";
import { RecordCard } from "./record-card";

/**
 * Main feed. Server-rendered list of cards + cursor pagination at
 * bottom. Empty-state branches based on whether filters are active
 * (no matches vs. genuinely no data).
 *
 * healthMap is keyed by state_id; passed from the dashboard root
 * (fetchDataSourceHealthMap) and threaded down to RecordCard so each
 * card renders its state's freshness without a per-record DB lookup.
 */
export function Feed({
  page,
  filters,
  healthMap,
}: {
  page: PageResult;
  filters: FilterState;
  healthMap: StateHealthMap;
}) {
  if (page.records.length === 0) {
    const reason = hasActiveFilters(filters) ? "no_matches" : "no_records";
    return (
      <div className="space-y-4">
        <EmptyState reason={reason} />
        <FeedFooter totalCount={page.totalCount} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {page.records.map((r) => (
        <RecordCard
          key={r.id}
          record={r}
          health={healthMap.get(r.state_id) ?? null}
        />
      ))}
      <CursorPagination nextCursor={page.nextCursor} />
      <FeedFooter totalCount={page.totalCount} />
    </div>
  );
}
