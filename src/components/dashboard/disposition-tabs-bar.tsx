"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  StatusTabs,
  type StatusTabValue,
} from "./disposition/status-tabs";
import { useStatusCounts } from "./disposition/status-counts-context";

/**
 * URL-driven wrapper around Design's StatusTabs. The active tab is
 * server-resolved; counts are read from StatusCountsContext so they
 * update optimistically on disposition changes without a full RSC
 * re-render. Tab selection lives in the URL as `?tab=<value>` so it's
 * shareable, back-button-friendly, and aligned with the existing
 * FilterForm / saved-views URL contract.
 *
 * Cursor is dropped on tab change — new filter = page 1.
 */
export function DispositionTabsBar({
  active,
  serverCounts,
}: {
  active: StatusTabValue;
  /** Initial counts from the server render — seeded into context by
   *  StatusCountsProvider; passed here as a fallback for the "all" tab
   *  which changes with filter state, not disposition status. */
  serverCounts: Partial<Record<StatusTabValue, number>>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const { counts: contextCounts } = useStatusCounts();

  // "all" count is filter-dependent — always use the server value.
  // Status-specific counts are optimistically maintained in context.
  const counts: Partial<Record<StatusTabValue, number>> = {
    ...contextCounts,
    all: serverCounts.all,
  };

  function handleChange(next: StatusTabValue) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("cursor");
    if (next === "all") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/?${qs}` : "/");
    });
  }

  return <StatusTabs active={active} counts={counts} onChange={handleChange} />;
}
