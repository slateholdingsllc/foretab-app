import { cn } from "@/lib/utils";
import type { ActivityTimelineRow } from "@/lib/disposition/types";
import { STATUS_VISUAL } from "./status-meta";

/**
 * ActivityTimeline — renders the merged BusinessDispositionEvent +
 * LicenseTouch feed (ActivityTimelineRow). The `source` discriminator picks
 * the schema; `kind` picks the icon + node accent. Node colors are tokens:
 * status_change→Won/Lost-aware, touches→accent, the rest neutral.
 */
export function ActivityTimeline({ rows }: { rows: ActivityTimelineRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-foreground-subtle">No activity yet.</p>;
  }
  return (
    <div className="flex flex-col">
      {rows.map((row, i) => (
        <Item key={row.id} row={row} last={i === rows.length - 1} />
      ))}
    </div>
  );
}

type NodeTone = "neutral" | "accent" | "success" | "destructive";

function Item({ row, last }: { row: ActivityTimelineRow; last: boolean }) {
  const { icon, tone, text, sub } = describe(row);
  return (
    <div className="flex gap-3 pb-[18px] last:pb-0">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border",
            tone === "accent" && "border-accent bg-accent-tint text-accent",
            tone === "success" && "border-success bg-success-tint text-success",
            tone === "destructive" && "border-destructive bg-destructive-tint text-destructive",
            tone === "neutral" && "border-border bg-surface-2 text-foreground-muted",
          )}
        >
          {icon}
        </span>
        {!last ? <span className="mt-1 min-h-3 w-px flex-1 bg-border" /> : null}
      </div>
      <div className="min-w-0 pt-px">
        <div className="text-sm leading-snug tracking-[-0.005em] text-foreground">{text}</div>
        <div className="mt-0.5 font-mono text-[10px] tracking-[0.04em] text-foreground-muted">{sub}</div>
      </div>
    </div>
  );
}

function describe(row: ActivityTimelineRow): {
  icon: React.ReactNode;
  tone: NodeTone;
  text: React.ReactNode;
  sub: string;
} {
  const when = formatStamp(row.created_at);

  if (row.source === "business_event") {
    switch (row.kind) {
      case "status_change": {
        const next = (row.payload?.to as string) ?? "";
        const label = next && next in STATUS_VISUAL ? STATUS_VISUAL[next as keyof typeof STATUS_VISUAL].label : next;
        const reason = row.payload?.lost_reason as string | undefined;
        const tone: NodeTone = next === "won" ? "success" : next === "lost" ? "destructive" : "accent";
        return {
          icon: next === "lost" ? <XIcon /> : <CheckIcon />,
          tone,
          text: (
            <>
              Status → <strong className="font-medium">{label}</strong>
              {reason ? <span className="text-foreground-muted"> · {reason.replace(/_/g, " ")}</span> : null}
            </>
          ),
          sub: `status_change · ${when}`,
        };
      }
      case "note": {
        const lr = row.payload?.lost_reason as string | undefined;
        return {
          icon: <NoteIcon />,
          tone: "neutral",
          text: lr ? (
            <>Lost reason — <span className="text-foreground-muted">{lr.replace(/_/g, " ")}</span></>
          ) : (
            "Note added"
          ),
          sub: `note · ${when}`,
        };
      }
      case "follow_up_set":
        return { icon: <CalendarIcon />, tone: "neutral", text: "Follow-up set", sub: `follow_up_set · ${when}` };
      case "follow_up_cleared":
        return { icon: <CalendarIcon />, tone: "neutral", text: "Follow-up cleared", sub: `follow_up_cleared · ${when}` };
    }
  }

  // license_touch
  const kind = row.kind;
  const verb = kind === "call" ? "Logged call" : kind === "email" ? "Logged email" : kind === "meeting" ? "Logged meeting" : "Logged touch";
  return {
    icon: kind === "email" ? <MailIcon /> : kind === "meeting" ? <UsersIcon /> : <PhoneIcon />,
    tone: "accent",
    text: verb,
    sub: `license_touch · ${kind} · ${when}`,
  };
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
}
function XIcon() {
  return <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>;
}
function NoteIcon() {
  return <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>;
}
function CalendarIcon() {
  return <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>;
}
function PhoneIcon() {
  return <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.7 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.74-1.27a2 2 0 0 1 2.11-.45c.74.34 1.53.57 2.34.7a2 2 0 0 1 1.72 2z" /></svg>;
}
function MailIcon() {
  return <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>;
}
function UsersIcon() {
  return <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}
