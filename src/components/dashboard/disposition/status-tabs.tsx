"use client";

import { cn } from "@/lib/utils";
import type { DispositionStatus } from "@/lib/disposition/types";
import { STATUS_TAB_ORDER } from "@/lib/disposition/types";
import { STATUS_VISUAL, SKIP_TAB_LABEL } from "./status-meta";
import { StatusDot } from "./status-picker";

/**
 * A UI-only filter value: every real DispositionStatus, plus "all" (the
 * prefix tab, not part of the enum).
 */
export type StatusTabValue = DispositionStatus | "all";

/**
 * StatusTabs — the worklist filter row. Ordered by STATUS_TAB_ORDER, which
 * deliberately OMITS `skip`; we render the muted "Skipped" tab separately at
 * the end after a hairline spacer, so dismissed records stay discoverable
 * without cluttering the primary row.
 */
export function StatusTabs({
  active,
  counts,
  onChange,
}: {
  active: StatusTabValue;
  /** Per-status counts; `all` is the total. */
  counts: Partial<Record<StatusTabValue, number>>;
  onChange: (next: StatusTabValue) => void;
}) {
  return (
    <div className="flex w-fit flex-wrap items-center gap-1 rounded-md border border-border bg-card p-1.5">
      <Tab value="all" label="All" active={active === "all"} count={counts.all} onChange={onChange} />

      {STATUS_TAB_ORDER.map((s) => (
        <Tab
          key={s}
          value={s}
          label={STATUS_VISUAL[s].label}
          dotStatus={s}
          active={active === s}
          count={counts[s]}
          onChange={onChange}
        />
      ))}

      <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

      <Tab
        value="skip"
        label={SKIP_TAB_LABEL}
        dotStatus="skip"
        active={active === "skip"}
        count={counts.skip}
        onChange={onChange}
        muted
      />
    </div>
  );
}

function Tab({
  value,
  label,
  dotStatus,
  active,
  count,
  onChange,
  muted,
}: {
  value: StatusTabValue;
  label: string;
  dotStatus?: DispositionStatus;
  active: boolean;
  count?: number;
  onChange: (next: StatusTabValue) => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium tracking-[-0.005em] transition-colors",
        active
          ? "bg-surface-2 text-foreground"
          : muted
            ? "text-foreground-subtle hover:text-foreground-muted"
            : "text-foreground-2 hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {dotStatus ? <StatusDot status={dotStatus} className="h-[7px] w-[7px]" /> : null}
      {label}
      {typeof count === "number" ? (
        <span
          className={cn(
            "rounded-full px-1.5 py-px font-mono text-[10px] tracking-[0.04em]",
            active ? "bg-surface-3 text-foreground-2" : "bg-surface-2 text-foreground-muted",
            muted && "bg-transparent",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
