"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  StatusTabs,
  type StatusTabValue,
} from "./disposition/status-tabs";

/**
 * URL-driven wrapper around Design's StatusTabs. The active tab + counts
 * are server-resolved; this client component handles the onChange
 * navigation. Tab selection lives in the URL as `?tab=<value>` so it's
 * shareable, back-button-friendly, and aligned with the existing
 * FilterForm / saved-views URL contract.
 *
 * Cursor is dropped on tab change — new filter = page 1.
 */
export function DispositionTabsBar({
  active,
  counts,
}: {
  active: StatusTabValue;
  counts: Partial<Record<StatusTabValue, number>>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

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
