"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type {
  ActivityTimelineRow,
  BusinessDisposition,
  DispositionStatus,
  LostReason,
  SignalStrength,
  TouchKind,
} from "@/lib/disposition/types";
import {
  setStatus,
  updateNotes,
  setFollowUp,
  logTouch,
  logView,
  getActivityTimeline,
} from "@/lib/disposition/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SignalTier, SignalReason } from "./signal-tier";
import { StatusPickerStack, LostReasonPicker } from "./status-picker";
import { ActivityTimeline } from "./activity-timeline";

/**
 * DetailPanel — the slide-over that opens from DispositionRow.onOpen.
 *
 * Self-contained: on open it fetches the activity timeline
 * (getActivityTimeline) and logs the view (logView). Status changes are
 * optimistic; notes save on blur (updateNotes); the lost-reason grid shows
 * only when status==='lost'. The footer wires the two touch actions —
 * Log touch (logTouch, needs classifiedRecordId) and Set follow-up
 * (setFollowUp) — and re-pulls the timeline after each mutation so new
 * events appear immediately. Signal display + the always-inline reason use
 * the shared signal-tier system. No data-layer logic lives here.
 */
export function DetailPanel({
  open,
  businessId,
  classifiedRecordId,
  displayName,
  dba,
  facets = [],
  signal,
  signalReason,
  disposition,
  onClose,
}: {
  open: boolean;
  businessId: string;
  /** Required for logTouch (touches are license-grained, not business-grained). */
  classifiedRecordId: string;
  displayName: string;
  dba?: string | null;
  facets?: string[];
  signal: SignalStrength | null;
  signalReason: string | null;
  disposition: BusinessDisposition | null;
  onClose?: () => void;
}) {
  const [status, setLocalStatus] = React.useState<DispositionStatus>(
    disposition?.status ?? "uncontacted",
  );
  const [lostReason, setLostReason] = React.useState<LostReason | null>(
    disposition?.lost_reason ?? null,
  );
  const [notes, setNotes] = React.useState(disposition?.notes ?? "");
  const [followUpAt, setLocalFollowUp] = React.useState<string | null>(
    disposition?.follow_up_at ?? null,
  );
  const [timeline, setTimeline] = React.useState<ActivityTimelineRow[]>([]);
  const [loadingTimeline, setLoadingTimeline] = React.useState(true);
  const [, startTransition] = React.useTransition();

  const refreshTimeline = React.useCallback(() => {
    getActivityTimeline(businessId).then((rows) => {
      setTimeline(rows);
      setLoadingTimeline(false);
    });
  }, [businessId]);

  // On open: load timeline + record the view. Reset local state to the
  // disposition we were handed (panel may be reused for another record).
  React.useEffect(() => {
    if (!open) return;
    setLocalStatus(disposition?.status ?? "uncontacted");
    setLostReason(disposition?.lost_reason ?? null);
    setNotes(disposition?.notes ?? "");
    setLocalFollowUp(disposition?.follow_up_at ?? null);
    setLoadingTimeline(true);
    refreshTimeline();
    logView(businessId);
  }, [open, businessId, disposition, refreshTimeline]);

  // Esc to close.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function changeStatus(next: DispositionStatus) {
    const prev = status;
    setLocalStatus(next);
    startTransition(async () => {
      const res = await setStatus(
        businessId,
        next,
        next === "lost" ? lostReason ?? undefined : undefined,
      );
      if (!res?.ok) setLocalStatus(prev);
      else refreshTimeline();
    });
  }

  function chooseReason(next: LostReason) {
    setLostReason(next);
    startTransition(async () => {
      const res = await setStatus(businessId, "lost", next);
      if (res?.ok) refreshTimeline();
    });
  }

  function commitNotes() {
    if (notes === (disposition?.notes ?? "")) return;
    startTransition(async () => {
      const res = await updateNotes(businessId, notes);
      if (res?.ok) refreshTimeline();
    });
  }

  function recordTouch(kind: TouchKind) {
    startTransition(async () => {
      const res = await logTouch(classifiedRecordId, kind);
      if (res?.ok) refreshTimeline();
    });
  }

  function changeFollowUp(at: string | null) {
    const prev = followUpAt;
    setLocalFollowUp(at);
    startTransition(async () => {
      const res = await setFollowUp(businessId, at);
      if (!res?.ok) setLocalFollowUp(prev);
      else refreshTimeline();
    });
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 transition-opacity duration-200",
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      )}
      aria-hidden={!open}
    >
      {/* Scrim — a neutral darkening overlay (theme-independent). */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${displayName} — disposition detail`}
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-[420px] flex-col overflow-y-auto border-l border-border bg-card shadow-lg",
          "transition-transform duration-250 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="sticky top-0 z-10 border-b border-border bg-card px-5 pb-4 pt-[18px]">
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
              className="-mr-1.5 rounded p-1 text-foreground-muted transition-colors hover:bg-surface-2 hover:text-foreground"
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
            {loadingTimeline ? (
              <p className="text-xs text-foreground-subtle">Loading activity…</p>
            ) : (
              <ActivityTimeline rows={timeline} />
            )}
          </Field>
        </div>

        <footer className="sticky bottom-0 mt-auto flex items-center gap-2 border-t border-border bg-card px-5 py-3.5">
          <QuickMenu
            label="Log touch"
            variant="outline"
            options={[
              { key: "call", label: "Call" },
              { key: "email", label: "Email" },
              { key: "meeting", label: "Meeting" },
            ]}
            onPick={(k) => recordTouch(k as TouchKind)}
          />
          <QuickMenu
            label={followUpAt ? `Follow-up · ${shortDate(followUpAt)}` : "Set follow-up"}
            variant="secondary"
            active={!!followUpAt}
            options={[
              { key: "today", label: "Today" },
              { key: "tomorrow", label: "Tomorrow" },
              { key: "week", label: "In 1 week" },
              ...(followUpAt ? [{ key: "clear", label: "Clear", danger: true }] : []),
            ]}
            onPick={(k) => changeFollowUp(followUpFromKey(k))}
          />
        </footer>
      </aside>
    </div>
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

/** Small popover menu used by the footer touch + follow-up actions. */
function QuickMenu({
  label,
  variant,
  active,
  options,
  onPick,
}: {
  label: string;
  variant: "outline" | "secondary";
  active?: boolean;
  options: { key: string; label: string; danger?: boolean }[];
  onPick: (key: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

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
      <Button
        variant={active ? "secondary" : variant}
        size="sm"
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </Button>
      {open ? (
        <div className="absolute bottom-[calc(100%+6px)] left-0 z-20 w-40 overflow-hidden rounded-md border border-border bg-surface-2 p-1 shadow-lg">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                onPick(o.key);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center rounded px-2.5 py-1.5 text-left text-sm transition-colors",
                o.danger
                  ? "text-destructive hover:bg-destructive-tint"
                  : "text-foreground-2 hover:bg-card hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function followUpFromKey(key: string): string | null {
  if (key === "clear") return null;
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  if (key === "tomorrow") d.setDate(d.getDate() + 1);
  if (key === "week") d.setDate(d.getDate() + 7);
  return d.toISOString();
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
