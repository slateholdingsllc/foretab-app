"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SignalMethodology } from "@/components/dashboard/signal-methodology";

/**
 * SignalMethodologyButton — the "?" info affordance that opens the
 * methodology explainer as a compact modal.
 *
 * Entry point #1 (primary): sits inline with the "Signal strength" filter
 * group header in the sidebar FilterForm — peak intent, where a rep first
 * filters by tier and asks "what do these mean?". Opens <SignalMethodology
 * compact /> in a lightweight modal — no route change, dismissible.
 *
 * Reusable: the guided-tour coachmark link (entry #2) can render the same
 * modal via <SignalMethodologyButton asLink />.
 *
 * Theme: semantic tokens only — flips via [data-theme]. No `dark:` variants.
 */
export function SignalMethodologyButton({
  asLink = false,
  className,
}: {
  /** Render as a text link ("How signals work →") instead of a "?" glyph. */
  asLink?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {asLink ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline",
            className,
          )}
        >
          How signals work
          <span aria-hidden="true">→</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="How Foretab signals work"
          className={cn(
            "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.4px] border-current font-mono text-[10px] font-semibold text-foreground-muted transition-colors hover:text-primary",
            className,
          )}
        >
          ?
        </button>
      )}
      {open ? <SignalMethodologyModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** The modal shell — exported so any surface can open the explainer. */
export function SignalMethodologyModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="How Foretab signals work"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div className="relative w-full max-w-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-foreground-muted hover:bg-surface-2 hover:text-foreground"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <SignalMethodology compact className="shadow-2xl" />
      </div>
    </div>
  );
}
