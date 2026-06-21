"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { DispositionStatus, LostReason } from "@/lib/disposition/types";
import { STATUS_PICKER_ORDER } from "@/lib/disposition/types";
import { STATUS_VISUAL, LOST_REASONS } from "./status-meta";

/** 8px status dot in the engagement-ramp treatment for a given status. */
export function StatusDot({
  status,
  className,
}: {
  status: DispositionStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        STATUS_VISUAL[status].dot,
        className,
      )}
    />
  );
}

/**
 * Compact pill trigger + dropdown — used inline on the DispositionRow strip.
 * Controlled-light: manages its own open state, calls `onChange` with the
 * chosen status. The actual persistence (updateDispositionStatus server
 * action) is wired by the caller.
 */
export function StatusPill({
  status,
  onChange,
}: {
  status: DispositionStatus;
  onChange: (next: DispositionStatus) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const v = STATUS_VISUAL[status];

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-tour-id="status-pill"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-2.5 pr-1.5",
          "font-mono text-[10.5px] font-medium uppercase tracking-[0.05em] text-foreground",
          "transition-colors hover:border-surface-3",
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <StatusDot status={status} />
        <span className={v.text}>{v.label}</span>
        <svg
          viewBox="0 0 24 24"
          className="h-3 w-3 text-foreground-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          role="listbox"
          className={cn(
            "absolute left-0 top-[calc(100%+6px)] z-30 w-44 overflow-hidden rounded-md border border-border bg-surface-2 p-1 shadow-lg",
          )}
        >
          {STATUS_PICKER_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={s === status}
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-sm transition-colors",
                s === status
                  ? "bg-card text-foreground"
                  : "text-foreground-2 hover:bg-card",
              )}
            >
              <StatusDot status={s} />
              <span className="font-medium tracking-[-0.005em]">
                {STATUS_VISUAL[s].label}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Vertical stacked picker — used in the DetailPanel. Active option is
 * accent-bordered (destructive-tinted when the active status is Lost).
 */
export function StatusPickerStack({
  status,
  onChange,
}: {
  status: DispositionStatus;
  onChange: (next: DispositionStatus) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {STATUS_PICKER_ORDER.map((s) => {
        const active = s === status;
        const lostActive = active && s === "lost";
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={cn(
              "flex items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors",
              active
                ? lostActive
                  ? "border-destructive bg-destructive-tint text-foreground"
                  : "border-accent bg-accent-tint text-foreground"
                : "border-border bg-card text-foreground-2 hover:bg-surface-2",
            )}
          >
            <StatusDot status={s} />
            <span className="font-medium tracking-[-0.005em]">
              {STATUS_VISUAL[s].label}
            </span>
            {active ? (
              <svg
                viewBox="0 0 24 24"
                className={cn(
                  "ml-auto h-3.5 w-3.5",
                  lostActive ? "text-destructive" : "text-accent",
                )}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Lost-reason grid — rendered only when status === "lost". */
export function LostReasonPicker({
  value,
  onChange,
}: {
  value: LostReason | null;
  onChange: (next: LostReason) => void;
}) {
  const reasons = Object.keys(LOST_REASONS) as LostReason[];
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {reasons.map((r) => {
        const active = r === value;
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            className={cn(
              "rounded-md border px-2.5 py-2 text-left text-xs tracking-[-0.005em] transition-colors",
              active
                ? "border-destructive bg-destructive-tint text-foreground"
                : "border-border bg-card text-foreground-2 hover:bg-surface-2",
            )}
          >
            {LOST_REASONS[r]}
          </button>
        );
      })}
    </div>
  );
}
