import Link from "next/link";
import { serializeFiltersToSearchParams } from "@/lib/dashboard/filters";
import type { ExportStatus } from "@/lib/dashboard/queries";
import type { FilterState } from "@/lib/dashboard/types";

/**
 * Feed footer: total count + CSV export link + trial usage counter + Terms.
 *
 * Export is a plain anchor to /api/export.csv with the current filters in
 * the query string. The browser handles the download via the route's
 * Content-Disposition header — no client JS, no form action.
 *
 * Trial customers: counter shows "N / 25 records exported". When N >= 25
 * the link goes inert and the counter explains why.
 *
 * Paid customers: no counter (10K per-export cap is enforced server-side
 * and rarely material in the UI).
 */
export function FeedFooter({
  totalCount,
  filters,
  exportStatus,
}: {
  totalCount: number | null;
  filters: FilterState;
  exportStatus: ExportStatus;
}) {
  const params = serializeFiltersToSearchParams(filters);
  const exportHref = `/api/export.csv${params.toString() ? `?${params.toString()}` : ""}`;

  return (
    <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-input pt-4 text-sm text-muted-foreground">
      <div>
        {totalCount === null
          ? "Loading count…"
          : totalCount === 1
            ? "1 record"
            : `${totalCount.toLocaleString()} records`}
        {exportStatus.isTrial && exportStatus.alreadyExported !== undefined ? (
          <span className="ml-3 text-xs">
            Trial export: {exportStatus.alreadyExported} / {exportStatus.cap}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <ExportLink
          href={exportHref}
          canExport={exportStatus.canExport}
          isTrial={exportStatus.isTrial}
          cap={exportStatus.cap}
          alreadyExported={exportStatus.alreadyExported}
        />
        <a
          href="https://foretab.com/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          Terms
        </a>
      </div>
    </footer>
  );
}

function ExportLink({
  href,
  canExport,
  isTrial,
  cap,
  alreadyExported,
}: {
  href: string;
  canExport: boolean;
  isTrial: boolean;
  cap: number;
  alreadyExported: number | undefined;
}) {
  const baseClass =
    "inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors";

  if (!canExport) {
    const title = isTrial
      ? `Trial export limit reached (${cap} records). Upgrade for higher limits.`
      : "Export unavailable for your account.";
    return (
      <span
        className={`${baseClass} cursor-not-allowed opacity-50`}
        title={title}
        aria-disabled="true"
      >
        Export CSV
      </span>
    );
  }

  const title = isTrial
    ? `Trial: up to ${cap - (alreadyExported ?? 0)} more rows in this export.`
    : `Up to ${cap.toLocaleString()} rows per export.`;

  return (
    <Link
      href={href}
      className={`${baseClass} hover:bg-accent hover:text-accent-foreground`}
      title={title}
      prefetch={false}
    >
      Export CSV
    </Link>
  );
}
