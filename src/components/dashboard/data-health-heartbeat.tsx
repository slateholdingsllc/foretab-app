"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Data-health heartbeat — the ambient refresh-health indicator that
 * replaces the top-of-feed DegradedStateBanner.
 *
 * Design decisions (locked):
 *   - PERSISTENT + OUT OF THE FEED. Lives in the sidebar foot (desktop)
 *     and as a top-bar dot (mobile). Never consumes record-feed space —
 *     the failure mode that sank the banner three times.
 *   - STANDS BY GREEN. A quiet green pulse means "all states fresh" — a
 *     daily trust signal, not error-only chrome. Turns amber / red on
 *     degradation.
 *   - CLASS-THEME ONLY. Every color is a semantic design token
 *     (--color-success / --color-warning / --color-destructive /
 *     --color-foreground …) that flips with the [data-theme] class on
 *     <html>. NO Tailwind `dark:` variants and NO prefers-color-scheme —
 *     that media-query coupling is exactly what broke the old banner in
 *     all four app×OS combinations.
 *   - NOT PERMANENTLY DISMISSIBLE. The popover opens/closes; there is no
 *     "hide" that survives the degraded condition. (Session-scoped only,
 *     and we don't even need that here — closing the popover returns to
 *     the always-visible pulse.)
 *
 * Severity mirrors DegradedStateBanner exactly (computed server-side in
 * <DataHealthIndicator>): amber = behind schedule (yellow/orange
 * freshness or operator status=yellow); red = failing (red freshness or
 * operator status=red).
 */

export type HealthSeverity = "healthy" | "amber" | "red";

export type HealthStateEntry = {
  /** Two-letter state/jurisdiction code, e.g. "CO". */
  code: string;
  /** Display name, e.g. "Colorado". */
  name: string;
  /** Per-state severity for the row dot. */
  severity: "amber" | "red";
  /** Whole days since last successful refresh, or null if unknown. */
  staleDays: number | null;
  lastRefreshAt: string | null;
};

const TONE: Record<
  HealthSeverity,
  { dot: string; text: string; surface: string; ring: string }
> = {
  healthy: {
    dot: "bg-success",
    text: "text-success",
    surface: "bg-success-tint",
    ring: "bg-success",
  },
  amber: {
    dot: "bg-warning",
    text: "text-warning",
    surface: "bg-warning-tint",
    ring: "bg-warning",
  },
  red: {
    dot: "bg-destructive",
    text: "text-destructive",
    surface: "bg-destructive-tint",
    ring: "bg-destructive",
  },
};

function relAge(staleDays: number | null): string {
  if (staleDays === null) return "no data";
  if (staleDays <= 0) return "today";
  return `${staleDays}d ago`;
}

export function DataHealthHeartbeat({
  severity,
  entries,
  totalStates,
  variant = "sidebar",
  className,
}: {
  severity: HealthSeverity;
  /** Degraded states only; empty when healthy. */
  entries: HealthStateEntry[];
  /** Total accessible states, for the healthy-state copy. */
  totalStates: number;
  variant?: "sidebar" | "topbar";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tone = TONE[severity];
  const degraded = severity !== "healthy";
  const count = entries.length;

  // Close on outside-click / Esc. (Open/close only — never a persistent hide.)
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = degraded
    ? `${count} ${count === 1 ? "state" : "states"} ${severity === "red" ? "stale" : "behind"}`
    : "All states fresh";

  const pulse = (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
      <span
        className={cn(
          "absolute inline-flex h-full w-full rounded-full opacity-60",
          tone.ring,
          "motion-safe:animate-ping",
        )}
      />
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", tone.dot)} />
    </span>
  );

  // ── Top-bar variant (mobile): just the pulse, optional count badge. ──
  if (variant === "topbar") {
    return (
      <div ref={ref} className={cn("relative", className)}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={
            degraded ? `Data health: ${label}` : "Data health: all states fresh"
          }
          aria-expanded={open}
          className="flex items-center gap-1.5 rounded-full p-1.5 transition-colors hover:bg-secondary"
        >
          {pulse}
          {degraded ? (
            <span className={cn("font-mono text-[12px] font-medium", tone.text)}>
              {count}
            </span>
          ) : null}
        </button>
        {open ? <HealthPopover severity={severity} entries={entries} totalStates={totalStates} align="right" /> : null}
      </div>
    );
  }

  // ── Sidebar variant (desktop): pulse + label chip in the sidebar foot. ──
  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Data health: ${label}`}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors",
          tone.surface,
          "hover:brightness-[0.98]",
        )}
      >
        {pulse}
        <span className={cn("font-mono text-[12px] font-medium tracking-[0.02em]", tone.text)}>
          {label}
        </span>
        {degraded ? (
          <svg
            viewBox="0 0 24 24"
            className={cn("ml-auto h-3.5 w-3.5", tone.text)}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        ) : null}
      </button>
      {open ? <HealthPopover severity={severity} entries={entries} totalStates={totalStates} align="left" /> : null}
    </div>
  );
}

function HealthPopover({
  severity,
  entries,
  totalStates,
  align,
}: {
  severity: HealthSeverity;
  entries: HealthStateEntry[];
  totalStates: number;
  align: "left" | "right";
}) {
  const degraded = severity !== "healthy";
  return (
    <div
      role="dialog"
      aria-label="Data refresh health by state"
      className={cn(
        "absolute bottom-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-lg border border-border bg-popover shadow-lg",
        align === "left" ? "left-0" : "right-0",
      )}
    >
      <div className="border-b border-border px-3.5 py-3">
        <p className="text-sm font-semibold text-foreground">
          {degraded
            ? severity === "red"
              ? "Data refresh is failing"
              : "Data refresh is behind schedule"
            : "All states are current"}
        </p>
        <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
          {degraded
            ? `${entries.length} of ${totalStates} states affected`
            : `${totalStates} states · refreshed on schedule`}
        </p>
      </div>

      {degraded ? (
        <ul className="max-h-64 overflow-y-auto py-1">
          {entries.map((e) => (
            <li
              key={e.code}
              className="flex items-center justify-between gap-3 px-3.5 py-2"
            >
              <span className="inline-flex items-center gap-2 font-mono text-xs text-foreground">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    e.severity === "red" ? "bg-destructive" : "bg-warning",
                  )}
                />
                {e.code}
                <span className="text-muted-foreground">{e.name}</span>
              </span>
              <span className="font-mono text-[12px] text-muted-foreground">
                {relAge(e.staleDays)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
          Every accessible state refreshed within its cadence window. We'll
          flag any that fall behind here.
        </p>
      )}
    </div>
  );
}
