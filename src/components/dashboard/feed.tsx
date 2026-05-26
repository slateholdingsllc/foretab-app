import type { FilterState, PageResult } from "@/lib/dashboard/types";
import { hasActiveFilters } from "@/lib/dashboard/filters";
import { CursorPagination } from "./cursor-pagination";
import { EmptyState } from "./empty-state";
import { FeedFooter } from "./feed-footer";
import { RecordCard } from "./record-card";

/**
 * Main feed. Server-rendered list of cards + cursor pagination at
 * bottom. Empty-state branches based on whether filters are active
 * (no matches vs. genuinely no data).
 */
export function Feed({
  page,
  filters,
}: {
  page: PageResult;
  filters: FilterState;
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
        <RecordCard key={r.id} record={r} />
      ))}
      <CursorPagination nextCursor={page.nextCursor} />
      <FeedFooter totalCount={page.totalCount} />
    </div>
  );
}
