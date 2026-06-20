import { cn } from "@/lib/utils";

/**
 * WorklistLayout — the records-first worklist arrangement (Part 2 of the
 * dashboard layout revision; mock approved in
 * dashboard-www/dashboard-layout-revision.html).
 *
 * Structure inside AppShell's <main>:
 *
 *   ┌───────────────────────────────────────────────┐
 *   │  tabs (slim disposition-status row, sticky)    │   ← center column header
 *   ├──────────────────────────────┬────────────────┤
 *   │  records (the worklist)       │  rail          │
 *   │  …only this column scrolls    │  Today         │
 *   │                               │  Insights ▢    │   ← reserved slot
 *   └──────────────────────────────┴────────────────┘
 *
 * Laptop target: the tabs row + 2–3 record cards are visible without
 * scrolling; only the records column scrolls, so the rep never loses the
 * tabs or the rail.
 *
 * Mobile: the rail content stacks BELOW the tabs+records (tabs → records →
 * rail). The rail's own internal order (Today, then Insights) is preserved.
 *
 * This component is layout-only — it takes slots. C wires the real
 * <DispositionTabs>, the record list, <TodayPanel>, and (later) <Insights>
 * into them. All spacing/structure decisions live here.
 *
 * Note: AppShell already renders TopBar + left Sidebar; this fills <main>.
 * It assumes <main> has had its default p-6 dropped (see integration notes)
 * so the tabs row can sit flush and sticky.
 */
export function WorklistLayout({
  tabs,
  children,
  rail,
  className,
}: {
  /** Slim disposition-status tabs row (sticky atop the records column). */
  tabs: React.ReactNode;
  /** The record feed. Only this region scrolls on desktop. */
  children: React.ReactNode;
  /** Right-rail content: TodayPanel now, Insights reserved below it. */
  rail: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Desktop: two columns — center records (1fr) + fixed rail.
        // Mobile: single column; the rail moves below via source order.
        "grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]",
        className,
      )}
    >
      {/* ── Center column: tabs header + scrolling records ── */}
      <section className="flex min-h-0 min-w-0 flex-col">
        {/* Slim tabs row — sticks to the top of the column while records scroll. */}
        <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-5 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          {tabs}
        </div>

        {/* Records feed — the only scroll region on desktop. On laptop
            heights the tabs row above + 2–3 cards land above the fold. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:py-5">
          <div className="flex flex-col gap-2.5">{children}</div>
        </div>
      </section>

      {/* ── Right rail (desktop) / stacked section (mobile) ──
          Border-l on desktop for tone separation; border-t on mobile since
          it sits below the feed. overflow-y-auto so a long rail scrolls
          independently of the records on desktop. */}
      <aside
        className={cn(
          "flex min-h-0 flex-col gap-4 border-t border-border bg-card p-4",
          "lg:border-l lg:border-t-0 lg:overflow-y-auto",
        )}
      >
        {rail}
      </aside>
    </div>
  );
}

/**
 * WorklistRail — convenience wrapper that orders the rail's contents:
 * Today first, then the reserved Insights slot. Pass `insights` once it
 * exists; until then the slot renders nothing (no dead chrome).
 */
export function WorklistRail({
  today,
  insights,
}: {
  today: React.ReactNode;
  insights?: React.ReactNode;
}) {
  return (
    <>
      {today}
      {insights ?? null}
    </>
  );
}
