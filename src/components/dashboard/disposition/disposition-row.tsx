"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { BusinessDisposition, DispositionStatus } from "@/lib/disposition/types";
import { setStatus } from "@/lib/disposition/actions";
import { Button } from "@/components/ui/button";
import { StatusPill } from "./status-picker";
import { useStatusCounts } from "./status-counts-context";

/**
 * DispositionRow — the disposition strip mounted on the base of each license
 * card (RecordCard). Sits on --surface-2, divided by a hairline. Holds the
 * status pill picker, follow-up + last-touch meta, a note flag, and the
 * row actions. Uncontacted (no disposition row) shows the "Work lead" CTA.
 *
 * Presentational + optimistic: flips local status immediately, calls the
 * `setStatus` server action, reverts on failure. All color is token-driven.
 */
export function DispositionRow({
  businessId,
  disposition,
  noteCount = 0,
  onOpen,
  onStatusConfirmed,
}: {
  businessId: string;
  disposition: BusinessDisposition | null;
  noteCount?: number;
  onOpen?: () => void;
  /** Called when a status change is confirmed by the server — lets the
   *  parent (`RecordDispositionStrip`) keep the panel in sync. */
  onStatusConfirmed?: (next: DispositionStatus) => void;
}) {
  const initial: DispositionStatus = disposition?.status ?? "uncontacted";
  const [status, setLocalStatus] = React.useState<DispositionStatus>(initial);
  const [pending, startTransition] = React.useTransition();
  const { onStatusChange } = useStatusCounts();

  function changeStatus(next: DispositionStatus) {
    const prev = status;
    setLocalStatus(next); // optimistic
    startTransition(async () => {
      const res = await setStatus(businessId, next);
      if (!res?.ok) {
        setLocalStatus(prev); // revert
      } else {
        onStatusChange(prev, next); // update tab counts in context
        onStatusConfirmed?.(next);  // keep parent disposition in sync
      }
    });
  }

  const isUncontacted = status === "uncontacted";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 border-t border-border bg-surface-2 px-[18px] py-2.5",
        pending && "opacity-70",
      )}
    >
      <StatusPill status={status} onChange={changeStatus} />

      <span className="h-4 w-px bg-border" aria-hidden="true" />

      <FollowUpMeta
        followUpAt={disposition?.follow_up_at ?? null}
        lastTouchedAt={disposition?.last_touched_at ?? null}
        lastTouchKind={disposition?.last_touch_kind ?? null}
      />

      {noteCount > 0 ? (
        <span className="inline-flex items-center gap-1.5 font-mono text-[13px] uppercase tracking-[0.04em] text-primary">
          <NoteIcon />
          {noteCount} {noteCount === 1 ? "note" : "notes"}
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-1">
        {isUncontacted ? (
          <>
            <Button variant="ghost" size="sm" onClick={onOpen}>
              Add note
            </Button>
            <Button variant="default" size="sm" onClick={onOpen}>
              Work lead
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" onClick={onOpen}>
            Open
          </Button>
        )}
      </div>
    </div>
  );
}

/** Follow-up / last-touch mono meta. Overdue → destructive, today → warning. */
function FollowUpMeta({
  followUpAt,
  lastTouchedAt,
  lastTouchKind,
}: {
  followUpAt: string | null;
  lastTouchedAt: string | null;
  lastTouchKind: string | null;
}) {
  if (followUpAt) {
    const due = new Date(followUpAt);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const dayDiff = Math.round(
      (startOfDue.getTime() - startOfToday.getTime()) / 86_400_000,
    );
    const overdue = dayDiff < 0;
    const today = dayDiff === 0;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-mono text-[13px] uppercase tracking-[0.04em]",
          overdue
            ? "text-destructive"
            : today
              ? "text-warning"
              : "text-foreground-muted",
        )}
      >
        <CalendarIcon />
        {overdue
          ? `Overdue ${Math.abs(dayDiff)}d`
          : today
            ? "Follow up today"
            : `Follow up in ${dayDiff}d`}
      </span>
    );
  }
  if (lastTouchedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[13px] uppercase tracking-[0.04em] text-foreground-muted">
        <ClockIcon />
        {lastTouchKind ? `${lastTouchKind} ` : ""}
        {relativeDays(lastTouchedAt)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[13px] uppercase tracking-[0.04em] text-foreground-muted">
      <ClockIcon />
      No activity yet
    </span>
  );
}

function relativeDays(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  return `${days}d ago`;
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}
function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
