"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type {
  ActivityTimelineRow,
  BusinessDisposition,
  DispositionStatus,
  LostReason,
  SignalStrength,
} from "@/lib/disposition/types";
import { setStatus, updateNotes } from "@/lib/disposition/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SignalTier, SignalReason } from "./signal-tier";
import { StatusPickerStack, LostReasonPicker } from "./status-picker";
import { ActivityTimeline } from "./activity-timeline";

/**
 * DetailPanel — the slide-over detail view. Status picker (vertical stack),
 * a lost-reason grid that appears only when status === "lost", the notes
 * box, and the merged activity timeline. The signal_strength_reason surfaces
 * as the always-visible inline caption beneath the tier badge.
 *
 * Optimistic on status; notes save on blur. All persistence via the
 * setStatus / updateNotes server actions — no data-layer logic here.
 */
export function DetailPanel({
  businessId,
  displayName,
  dba,
  facets = [],
  signal,
  signalReason,
  disposition,
  timeline,
  onClose,
}: {
  businessId: string;
  displayName: string;
  dba?: string | null;
  facets?: string[];
  signal: SignalStrength | null;
  signalReason: string | null;
  disposition: BusinessDisposition | null;
  timeline: ActivityTimelineRow[];
  onClose?: () => void;
}) {
  const [status, setLocalStatus] = React.useState<DispositionStatus>(
    disposition?.status ?? "uncontacted",
  );
  const [lostReason, setLostReason] = React.useState<LostReason | null>(
    disposition?.lost_reason ?? null,
  );
  const [notes, setNotes] = React.useState(disposition?.notes ?? "");
  const [, startTransition] = React.useTransition();

  function changeStatus(next: DispositionStatus) {
    const prev = status;
    setLocalStatus(next);
    startTransition(async () => {
      const res = await setStatus(businessId, next, next === "lost" ? lostReason ?? undefined : undefined);
      if (!res?.ok) setLocalStatus(prev);
    });
  }

  function chooseReason(next: LostReason) {
    setLostReason(next);
    startTransition(async () => {
      await setStatus(businessId, "lost", next);
    });
  }

  function commitNotes() {
    if (notes === (disposition?.notes ?? "")) return;
    startTransition(async () => {
      await updateNotes(businessId, notes);
    });
  }

  return (
    <aside className="flex w-full max-w-[400px] flex-col overflow-hidden rounded-lg border border-border bg-card">
      <header className="border-b border-border px-5 pb-4 pt-[18px]">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <h2 className="text-[17px] font-medium leading-tight tracking-[-0.02em] text-foreground">
              {displayName}
            </h2>
            {dba ? (
              <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-foreground-muted">
                DBA · {dba}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-foreground-muted transition-colors hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SignalTier signal={signal} />
          {facets.map((f) => (
            <Badge key={f} variant="outline" className="capitalize">
              {f.replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
        <SignalReason signal={signal} reason={signalReason} className="mt-1.5" />
      </header>

      <div className="flex flex-col gap-5 px-5 py-[18px]">
        <Field label="Status">
          <StatusPickerStack status={status} onChange={changeStatus} />
        </Field>

        {status === "lost" ? (
          <Field label="Lost reason">
            <LostReasonPicker value={lostReason} onChange={chooseReason} />
          </Field>
        ) : null}

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={commitNotes}
            rows={3}
            placeholder="Add a note…"
            className={cn(
              "w-full resize-none rounded-md border border-border bg-card px-3 py-2.5 text-sm leading-relaxed tracking-[-0.005em] text-foreground-2",
              "placeholder:text-foreground-subtle focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-ring",
            )}
          />
        </Field>

        <Field label="Activity">
          <ActivityTimeline rows={timeline} />
        </Field>
      </div>

      <footer className="mt-auto flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
        <Button variant="outline" size="sm">Log touch</Button>
        <Button variant="secondary" size="sm">Set follow-up</Button>
      </footer>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-foreground-muted">
        {label}
      </div>
      {children}
    </div>
  );
}
