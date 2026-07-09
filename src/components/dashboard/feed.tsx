import { Suspense } from "react";
import { hasActiveFilters, serializeFiltersToSearchParams } from "@/lib/dashboard/filters";
import type { ExportStatus } from "@/lib/dashboard/queries";
import { getAttributionsForStates } from "@/lib/state-attributions";
import type { DashboardRecord, FilterState, PageResult, StateHealthMap } from "@/lib/dashboard/types";
import { CursorPagination } from "./cursor-pagination";
import { EmptyState } from "./empty-state";
import { FeedFooter } from "./feed-footer";
import { BusinessCard } from "./business-card";
import { OpeningNowBar } from "./opening-now-bar";

/**
 * Main feed. Business-grain view — one card per account (business),
 * with the freshest qualifying signal as the headline and older license
 * events expandable underneath.
 *
 * Opening Now mode (the default, active when no explicit ?types= is in
 * the URL) shows new_issuance + application records filtered to
 * Active/Pending businesses in the customer's selected window.
 * The OpeningNowBar renders a window control and a "View all" escape
 * to ?all=1.
 *
 * Grouping is client-side by business_id. get_feed returns records sorted
 * newest-first; the first record per business is the headline. For the
 * Opening Now view (180-day window, two license types), most businesses
 * have a single qualifying record, so the collapse is effectively a no-op
 * on the layout. Full cross-page history (renewals under opening cards)
 * requires a get_business_license_history RPC from Agent A — specced for
 * a follow-up PR.
 */

type BusinessGroup = {
  businessId: string;
  headline: DashboardRecord;
  others: DashboardRecord[];
};

function groupByBusiness(records: DashboardRecord[]): BusinessGroup[] {
  const order: string[] = [];
  const map = new Map<string, DashboardRecord[]>();

  for (const r of records) {
    const key = r.business?.id ?? `record:${r.id}`;
    if (!map.has(key)) {
      order.push(key);
      map.set(key, []);
    }
    map.get(key)!.push(r);
  }

  return order.map((key) => {
    const recs = map.get(key)!;
    return {
      businessId: key,
      headline: recs[0]!,
      others: recs.slice(1),
    };
  });
}

export function Feed({
  page,
  filters,
  healthMap,
  exportStatus,
  isOpeningNow,
}: {
  page: PageResult;
  filters: FilterState;
  healthMap: StateHealthMap;
  exportStatus: ExportStatus;
  isOpeningNow: boolean;
}) {
  const attributions = getAttributionsForStates(
    page.records.map((r) => r.state_code),
  );

  if (page.records.length === 0) {
    if (filters.search.trim().length > 0) {
      const clearSearchParams = serializeFiltersToSearchParams({ ...filters, search: "" });
      const clearHref = clearSearchParams.toString() ? `/?${clearSearchParams}` : "/";
      return (
        <div className="space-y-4">
          {isOpeningNow ? (
            <OpeningNowBar daysWindow={filters.daysWindow ?? 180} />
          ) : null}
          <EmptyState reason="search_no_matches" searchTerm={filters.search} clearHref={clearHref} />
          <FeedFooter
            totalCount={page.totalCount}
            filters={filters}
            exportStatus={exportStatus}
            attributions={attributions}
          />
        </div>
      );
    }
    const reason = hasActiveFilters(filters) ? "no_matches" : "no_records";
    return (
      <div className="space-y-4">
        {isOpeningNow ? (
          <OpeningNowBar daysWindow={filters.daysWindow ?? 180} />
        ) : null}
        <EmptyState reason={reason} />
        <FeedFooter
          totalCount={page.totalCount}
          filters={filters}
          exportStatus={exportStatus}
          attributions={attributions}
        />
      </div>
    );
  }

  const groups = groupByBusiness(page.records);

  return (
    <div className="space-y-3">
      {isOpeningNow ? (
        <OpeningNowBar daysWindow={filters.daysWindow ?? 180} />
      ) : null}
      {page.totalCount !== null ? (
        <p className="px-1 text-[12px] leading-none text-foreground-subtle">
          {page.totalCount.toLocaleString()} businesses
          {page.recordCount !== null
            ? ` · ${page.recordCount.toLocaleString()} records match`
            : ""}
        </p>
      ) : null}
      {groups.map((g) => (
        <BusinessCard
          key={g.businessId}
          headline={g.headline}
          others={g.others}
          health={healthMap.get(g.headline.state_id) ?? null}
        />
      ))}
      <Suspense fallback={null}>
        <CursorPagination nextCursor={page.nextCursor} />
      </Suspense>
      <FeedFooter
        totalCount={page.totalCount}
        filters={filters}
        exportStatus={exportStatus}
        attributions={attributions}
      />
    </div>
  );
}
