"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SignalMethodology } from "@/components/dashboard/signal-methodology";

/**
 * SignalLegend — the day-1 "how signals work" entry point.
 *
 * Renders the three signal-tier chips inline (a compact legend), followed by
 * a small "?" button. Clicking "?" opens a lightweight modal with the full
 * <SignalMethodology compact> explainer — the system-level answer ("what does
 * New mean, can I trust it?") that complements the per-record SignalReason
 * caption ("why is THIS one New?").
 *
 * Where it lives (C's pick): above the worklist, beside the status tabs, or in
 * the Today/insights rail header — anywhere there's room for a legend. The
 * "?" deliberately lives on this roomy surface, NOT on the dense record rows
 * (which keep the no-tooltip, always-inline reason rule).
 *
 * Self-contained modal (no library) — matches the guided-tour pattern.
 * Semantic tokens only; flips via [data-theme].
 */
export function SignalLegend({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <div className={cn("inline-flex items-center gap-2", className)}>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          Signal
        </span>
        <LegendChip tone="bg-accent-tint text-primary" label="New" ripples={2} />
        <LegendChip tone="bg-secondary text-foreground-2" label="Established" ripples={1} />
        <LegendChip
          tone="border border-border bg-transparent text-foreground-muted"
          label="Dormant"
          ripples={0}
        />
        <button
          type="button"
          data-tour-id="signal-legend"
          onClick={() => setOpen(true)}
          aria-label="How Foretab signals work"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <span aria-hidden="true" className="text-[11px] font-semibold leading-none">
            ?
          </span>
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="How Foretab signals work"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="relative z-10 w-full max-w-2xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute -top-3 -right-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-colors hover:text-foreground"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            <SignalMethodology className="shadow-lg" />
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Inline legend chip — mirrors SignalTier's information-lane treatment. */
function LegendChip({
  tone,
  label,
  ripples,
}: {
  tone: string;
  label: string;
  ripples: 0 | 1 | 2;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-mono text-[10px] font-medium uppercase leading-snug tracking-[0.06em]",
        tone,
      )}
    >
      <svg viewBox="0 0 16 16" className="h-[13px] w-[13px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <circle cx="8" cy="8" r={ripples === 0 ? 3.5 : 2.5} fill="currentColor" stroke="none" />
        {ripples >= 1 ? <circle cx="8" cy="8" r={ripples === 2 ? 5.2 : 5.6} /> : null}
        {ripples >= 2 ? <circle cx="8" cy="8" r="7.2" /> : null}
      </svg>
      {label}
    </span>
  );
}
