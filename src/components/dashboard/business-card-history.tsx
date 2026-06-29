"use client";

import { useState, useTransition } from "react";
import { fetchBusinessLicenseHistory } from "@/lib/rpc/feed";
import { Badge } from "@/components/ui/badge";
import type { DashboardRecord } from "@/lib/dashboard/types";

/**
 * Expandable license history for a BusinessCard. On first open, calls
 * get_business_license_history via server action to fetch the full lifecycle
 * (new issuance → renewals → current). Result is cached locally — subsequent
 * opens are instant.
 *
 * knownOtherCount: how many records besides the headline are already in the
 * current page batch (from feed.tsx's groupByBusiness). Used for the initial
 * button label. May be 0 in Opening Now mode (get_feed_by_business returns
 * exactly one row per business). After the server-action fetch the count is
 * replaced by the actual history length.
 */
export function BusinessCardHistory({
  businessId,
  headlineId,
  knownOtherCount,
}: {
  businessId: string;
  headlineId: string;
  knownOtherCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<DashboardRecord[] | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    // Lazy fetch on first open; cached after that.
    if (history !== null) {
      setOpen(true);
      return;
    }
    startTransition(async () => {
      try {
        const rows = await fetchBusinessLicenseHistory(businessId, headlineId);
        setHistory(rows);
        setOpen(true);
      } catch {
        setFetchError(true);
        setOpen(true);
      }
    });
  }

  // Determine button label based on what we know.
  // Before fetch: use knownOtherCount if > 0, else a generic "History" label.
  // After fetch: use actual count.
  const count = history !== null ? history.length : knownOtherCount;
  const hasKnownHistory = count > 0;
  const buttonLabel = isPending
    ? "Loading…"
    : history !== null
      ? count === 0
        ? "No prior licenses on file"
        : count === 1
          ? "1 more on file"
          : `${count} more on file`
      : hasKnownHistory
        ? `${knownOtherCount} more on file`
        : "License history";

  // If we've fetched and confirmed zero history, don't render the section.
  if (history !== null && history.length === 0 && !open) return null;

  return (
    <div className="border-t border-border-soft">
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.06em] text-foreground-muted transition-colors hover:text-foreground disabled:cursor-wait"
      >
        <span
          className="inline-block transition-transform duration-150"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden="true"
        >
          ▾
        </span>
        {buttonLabel}
      </button>

      {open ? (
        <div className="space-y-2 border-t border-border-soft px-5 pb-4 pt-2.5">
          {fetchError ? (
            <p className="py-1 text-xs text-foreground-muted">
              Unable to load history — try again.
            </p>
          ) : history === null ? null : history.length === 0 ? (
            <p className="py-1 text-xs text-foreground-muted">
              No other licenses on file.
            </p>
          ) : (
            history.map((r) => <HistoryRow key={r.id} record={r} />)
          )}
        </div>
      ) : null}
    </div>
  );
}

function HistoryRow({ record }: { record: DashboardRecord }) {
  const dateStr = record.sort_date
    ? new Date(record.sort_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex items-center gap-2.5">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-border" />
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {record.license_record_type ? (
          <Badge variant="outline" className="capitalize text-[11px]">
            {record.license_record_type.replace(/_/g, " ")}
          </Badge>
        ) : null}
        {record.license_type_raw ? (
          <span className="truncate font-mono text-[11px] text-foreground-muted">
            {record.license_type_raw}
          </span>
        ) : null}
        {record.customer_status && record.customer_status !== "Active" ? (
          <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-foreground-muted">
            · {record.customer_status}
          </span>
        ) : null}
        {dateStr ? (
          <span className="font-mono text-[11px] text-foreground-muted">
            · {dateStr}
          </span>
        ) : null}
      </div>
    </div>
  );
}
