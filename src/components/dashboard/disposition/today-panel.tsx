import Link from "next/link";
import { cn } from "@/lib/utils";
import type { DueFollowUp, NewHighPriorityLead } from "@/lib/disposition/types";
import { Button } from "@/components/ui/button";
import { SignalTier } from "./signal-tier";

/**
 * TodayPanel — pinned strip in the right rail. Two stacked sections:
 *   Follow-ups due       follow_up_at <= now() on the rep's own dispositions
 *   New · high priority  signal_strength=New in last 7d, not yet dispositioned
 *
 * Sections stack vertically (single column) so each row has the full ~300px
 * rail width for [chip] [name + sub] [action]. "Work"/"Open" buttons navigate
 * to the worklist with that business pre-searched.
 *
 * Server component — all interactivity is URL navigation.
 */

const PANEL_ITEM_CAP = 5;

export function TodayPanel({
  due,
  newLeads,
  today = new Date(),
}: {
  due: DueFollowUp[];
  newLeads: NewHighPriorityLead[];
  today?: Date;
}) {
  const dateLabel = today
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .replace(",", " ·");

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2.5 border-b border-border px-[18px] py-3.5">
        <span className="h-[7px] w-[7px] rounded-full bg-accent shadow-[0_0_0_3px_var(--color-accent-tint)]" />
        <span className="text-sm font-medium tracking-[-0.01em] text-foreground">Today</span>
        <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.08em] text-foreground-muted">
          {dateLabel}
        </span>
      </header>

      {/* Single-column stack — rail is ~300-340px; 2-col would give 170px each,
          too narrow for chip + truncated name + action button. */}
      <div className="flex flex-col divide-y divide-border">
        <Section
          title="Follow-ups due"
          count={due.length}
          viewAllHref={due.length >= PANEL_ITEM_CAP ? "/?tab=working" : undefined}
        >
          {due.length === 0 ? (
            <Empty>Nothing due — you&apos;re clear.</Empty>
          ) : (
            due.map((d) => <DueItem key={d.disposition_id} item={d} today={today} />)
          )}
        </Section>

        <Section
          title="New · high priority"
          count={newLeads.length}
          viewAllHref={newLeads.length >= PANEL_ITEM_CAP ? "/?signal=New&ntw=1" : undefined}
        >
          {newLeads.length === 0 ? (
            <Empty>No new high-priority leads.</Empty>
          ) : (
            newLeads.map((l) => <LeadItem key={l.business_id} item={l} />)
          )}
        </Section>
      </div>
    </section>
  );
}

function Section({
  title,
  count,
  viewAllHref,
  children,
}: {
  title: string;
  count: number;
  viewAllHref?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-[18px] py-3.5">
      <div className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.1em] text-foreground-muted">
        <span>{title}</span>
        <div className="flex items-center gap-2">
          <span className="text-foreground-2">{count}</span>
          {viewAllHref && (
            <Link
              href={viewAllHref}
              className="normal-case text-primary hover:underline"
            >
              View all
            </Link>
          )}
        </div>
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function DueItem({ item, today }: { item: DueFollowUp; today: Date }) {
  const due = new Date(item.follow_up_at);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const dayDiff = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000);
  const overdue = dayDiff < 0;
  const searchHref = `/?q=${encodeURIComponent(item.display_name)}`;

  return (
    <Row>
      <span
        className={cn(
          "inline-flex h-2 w-2 shrink-0 rounded-full",
          overdue ? "bg-destructive" : "bg-accent",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium tracking-[-0.01em] text-foreground">
          {item.display_name}
        </div>
        <div
          className={cn(
            "mt-0.5 font-mono text-[11px] tracking-[0.03em]",
            overdue ? "text-destructive" : "text-warning",
          )}
        >
          {overdue ? `Overdue ${Math.abs(dayDiff)}d` : "Due today"}
        </div>
      </div>
      <Button variant="secondary" size="sm" asChild>
        <Link href={searchHref}>Open</Link>
      </Button>
    </Row>
  );
}

function LeadItem({ item }: { item: NewHighPriorityLead }) {
  const days = Math.max(
    0,
    Math.round((Date.now() - new Date(item.surfaced_at).getTime()) / 86_400_000),
  );
  const searchHref = `/?q=${encodeURIComponent(item.display_name)}`;

  return (
    <Row>
      <SignalTier signal={item.signal_strength} className="shrink-0 px-1.5 py-px text-[9px]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium tracking-[-0.01em] text-foreground">
          {item.display_name}
        </div>
        <div className="mt-0.5 font-mono text-[10px] tracking-[0.03em] text-foreground-muted">
          {item.state_code ? `${item.state_code} · ` : ""}
          {days === 0 ? "today" : `${days}d ago`}
        </div>
      </div>
      <Button variant="default" size="sm" asChild>
        <Link href={searchHref}>Work</Link>
      </Button>
    </Row>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-border-soft py-2.5 first:border-t-0">
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-xs text-foreground-subtle">{children}</p>;
}
