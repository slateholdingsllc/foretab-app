import { hasActiveFilters } from "@/lib/dashboard/filters";
import type { ExportStatus } from "@/lib/dashboard/queries";
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
 *
 * exportStatus drives the FeedFooter's CSV export link — trial customers
 * see a cumulative counter against the trial cap; paid customers get the
 * 10K-per-export ceiling.
 */
export function Feed({
  page,
  filters,
  healthMap,
  exportStatus,
}: {
  page: PageResult;
  filters: FilterState;
  healthMap: StateHealthMap;
  exportStatus: ExportStatus;
}) {
  if (page.records.length === 0) {
    const reason = hasActiveFilters(filters) ? "no_matches" : "no_records";
    return (
      <div className="space-y-4">
        <EmptyState reason={reason} />
        <FeedFooter
          totalCount={page.totalCount}
          filters={filters}
          exportStatus={exportStatus}
        />
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
      <FeedFooter
        totalCount={page.totalCount}
        filters={filters}
        exportStatus={exportStatus}
      />
    </div>
  );
}
