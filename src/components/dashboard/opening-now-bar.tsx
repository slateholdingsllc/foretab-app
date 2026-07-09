"use client";

import { cn } from "@/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const CHIP_BASE =
  "inline-flex h-7 cursor-pointer select-none items-center rounded border px-2.5 font-mono text-[12px] uppercase tracking-[0.05em] transition-colors leading-none";
const CHIP_OFF =
  "bg-card border-border text-foreground-2 hover:border-foreground-subtle hover:text-foreground";
const CHIP_ON = "bg-accent border-accent text-accent-foreground";

const WINDOW_OPTIONS = [
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
  { value: 180, label: "180d" },
  { value: 365, label: "1yr" },
] as const;

/**
 * Opening Now bar — appears above the feed when the default view is active.
 * Shows the active date window as chip pills (click to narrow/widen) and
 * an escape link to "View all" that adds ?all=1 to opt out of the Opening
 * Now preset.
 *
 * daysWindow is the EFFECTIVE window (server-resolved), not the raw URL value.
 */
export function OpeningNowBar({ daysWindow }: { daysWindow: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function setWindow(days: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("days", String(days));
    params.delete("cursor");
    startTransition(() => router.push(`/?${params.toString()}`));
  }

  function viewAllRecords() {
    const params = new URLSearchParams(searchParams.toString());
    // Clear the Opening Now-specific params; preserve state/territory filters.
    params.delete("types");
    params.delete("days");
    params.delete("ntw");
    params.delete("cursor");
    const qs = params.toString();
    startTransition(() => router.push(qs ? `/?${qs}` : "/"));
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
        <span className="text-sm font-semibold tracking-[-0.01em] text-foreground">
          Opening Now
        </span>
        <span className="hidden font-mono text-[13px] uppercase tracking-[0.06em] text-foreground-muted sm:inline">
          · New issuances &amp; applications
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 font-mono text-[12px] uppercase tracking-[0.06em] text-foreground-muted">
          Window
        </span>
        {WINDOW_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setWindow(o.value)}
            className={cn(CHIP_BASE, daysWindow === o.value ? CHIP_ON : CHIP_OFF)}
          >
            {o.label}
          </button>
        ))}
        <span className="mx-1.5 text-border-soft" aria-hidden="true">
          |
        </span>
        <button
          type="button"
          onClick={viewAllRecords}
          className="font-mono text-[12px] uppercase tracking-[0.06em] text-foreground-muted transition-colors hover:text-foreground"
        >
          View all
        </button>
      </div>
    </div>
  );
}
