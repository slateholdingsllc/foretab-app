"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { TOUR_STEPS } from "./tour-steps";

const STORAGE_KEY = "foretab_tour_v1";

type TargetRect = { top: number; left: number; width: number; height: number };

export function GuidedTour({
  shouldShow = true,
  onComplete,
}: {
  shouldShow?: boolean;
  onComplete?: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  useEffect(() => {
    if (!shouldShow) return;
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return;
    }
    setVisible(true);
  }, [shouldShow]);

  const step = TOUR_STEPS[stepIndex];

  const dismiss = useCallback(
    (complete: boolean) => {
      if (complete) {
        try {
          localStorage.setItem(STORAGE_KEY, "1");
        } catch {}
        onComplete?.();
      }
      setVisible(false);
    },
    [onComplete],
  );

  const measureTarget = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour-id="${step.targetId}"]`);
    if (!el) {
      if (stepIndex < TOUR_STEPS.length - 1) {
        setStepIndex((i) => i + 1);
      } else {
        dismiss(true);
      }
      return;
    }
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const r = el.getBoundingClientRect();
    setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step, stepIndex, dismiss]);

  useEffect(() => {
    if (!visible) return;
    measureTarget();
  }, [visible, stepIndex, measureTarget]);

  useEffect(() => {
    if (!visible) return;
    const onResize = () => measureTarget();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [visible, measureTarget]);

  function advance() {
    if (stepIndex < TOUR_STEPS.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      dismiss(true);
    }
  }

  if (!visible || !step) return null;

  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const PAD = 8;
  const POPOVER_W = 280;
  const POPOVER_OFFSET = 14;
  let popTop = 200,
    popLeft = 100;
  if (targetRect && typeof window !== "undefined") {
    const below = targetRect.top + targetRect.height + POPOVER_OFFSET;
    const above = targetRect.top - 160 - POPOVER_OFFSET;
    popTop = below + 160 < window.innerHeight ? below : Math.max(PAD, above);
    popLeft = Math.max(
      PAD,
      Math.min(
        targetRect.left + targetRect.width / 2 - POPOVER_W / 2,
        window.innerWidth - POPOVER_W - PAD,
      ),
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Guided tour: ${step.title}`}
      className="fixed inset-0 z-[100]"
    >
      {targetRect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-lg"
          style={{
            top: targetRect.top - PAD,
            left: targetRect.left - PAD,
            width: targetRect.width + PAD * 2,
            height: targetRect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
            outline: "2px solid var(--color-accent)",
            outlineOffset: "2px",
          }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-foreground/50" />
      )}
      <div
        className="fixed w-[280px] rounded-xl border border-border bg-card p-4 shadow-2xl"
        style={{ top: popTop, left: popLeft }}
      >
        <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-primary">
          {step.stepLabel}
        </div>
        <h4 className="mb-1.5 text-[15px] font-semibold leading-snug tracking-[-0.015em] text-foreground">
          {step.title}
        </h4>
        <p className="text-sm leading-relaxed text-foreground-2">{step.body}</p>
        <div className="mt-4 flex items-center gap-1.5">
          {TOUR_STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === stepIndex
                  ? "w-4 bg-accent"
                  : i < stepIndex
                    ? "w-1.5 bg-accent-soft"
                    : "w-1.5 bg-surface-3",
              )}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => dismiss(true)}
            className="text-sm text-foreground-muted transition-colors hover:text-foreground"
          >
            Skip tour
          </button>
          <button
            type="button"
            onClick={advance}
            className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            {isLast ? "Done" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
