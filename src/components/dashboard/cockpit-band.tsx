import { cn } from "@/lib/utils";
import { Insights } from "@/components/dashboard/disposition";
import type {
  ActivityDay,
  DispositionFunnelData,
  SignalWinRateRow,
} from "@/lib/disposition/types";

/**
 * CockpitBand — the full-width pipeline-health band that sits at the top of
 * the worklist landing, above the feed (CRM cockpit redesign, "band" fork;
 * approved mock: crm-cockpit/cockpit-band.html).
 *
 * Replaces the old arrangement where <Insights> was crammed into the 340px
 * right rail. The band spans the full main-column width so the funnel goes
 * horizontal, the win-rate bars read wide, and activity gets a real 30-bar
 * chart. The right rail now holds ONLY <TodayPanel> (see integration notes).
 *
 * Layout: greeting row · KPI strip (4) · 3-chart grid (1.5fr / 1fr / 1.2fr).
 * The three charts are the EXISTING <Insights> component, re-laid by the
 * `layout="band"` prop (horizontal). KPIs derive from data the page already
 * fetches (statusCounts + funnel + totalCount) — no new queries.
 *
 * Theme: semantic tokens only (bg-card, text-foreground, border-border,
 * text-success/destructive, accent-tint …) — flips via the [data-theme]
 * class. No `dark:` variants, no prefers-color-scheme.
 *
 * Visual layer only. C wires the data props (all already on the page) and
 * decides the greeting/derived-KPI sources; copy here is placeholder-safe.
 */

export type CockpitKpis = {
  inPipeline: number;
  working: number;
  won30d: number;
  /** Whole-number percent, e.g. 24 for 24%. */
  winRatePct: number;
  /** Optional deltas — omit to hide the delta line. */
  deltas?: Partial<
    Record<"inPipeline" | "working" | "won30d" | "winRatePct", { dir: "up" | "down"; label: string }>
  >;
};

export function CockpitBand({
  greetingName,
  dueTodayCount,
  dateLabel,
  kpis,
  funnel,
  winRate,
  activity,
  className,
}: {
  /** First name for the greeting, or null to show a neutral title. */
  greetingName?: string | null;
  /** Drives the "N follow-ups due today" subline. */
  dueTodayCount?: number;
  /** Short date label, e.g. "Fri · Jun 20". */
  dateLabel?: string;
  kpis: CockpitKpis;
  funnel: DispositionFunnelData;
  winRate: SignalWinRateRow[];
  activity: ActivityDay[];
  className?: string;
}) {
  const greeting = greetingName ? `Good morning, ${greetingName}` : "Your pipeline";

  return (
    <section
      className={cn(
        "flex flex-col gap-3.5 border-b border-border bg-surface-2 px-5 py-4 lg:px-6 lg:py-5",
        className,
      )}
    >
      {/* greeting row */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[22px] font-bold leading-none tracking-[-0.025em] text-foreground">
          {greeting}
        </h1>
        {typeof dueTodayCount === "number" ? (
          <span className="font-mono text-[11px] tracking-[0.02em] text-muted-foreground">
            {dueTodayCount} follow-up{dueTodayCount === 1 ? "" : "s"} due today
          </span>
        ) : null}
        {dateLabel ? (
          <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            {dateLabel}
          </span>
        ) : null}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Kpi label="In pipeline" value={kpis.inPipeline} delta={kpis.deltas?.inPipeline} />
        <Kpi label="Working" value={kpis.working} delta={kpis.deltas?.working} />
        <Kpi label="Won · 30d" value={kpis.won30d} delta={kpis.deltas?.won30d} />
        <Kpi label="Win rate" value={`${kpis.winRatePct}%`} delta={kpis.deltas?.winRatePct} />
      </div>

      {/* charts — the existing <Insights> 3-up grid. At full band width its
          md:grid-cols-3 lays the funnel / win-rate / activity out
          horizontally with real room (the whole point of the band). No new
          prop needed — width does the work. */}
      <Insights funnel={funnel} winRate={winRate} activity={activity} className="grid grid-cols-1 gap-3.5 md:grid-cols-[1.5fr_1fr_1.2fr]" />
    </section>
  );
}

function Kpi({
  label,
  value,
  delta,
}: {
  label: string;
  value: number | string;
  delta?: { dir: "up" | "down"; label: string };
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-3">
      <div className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-[27px] font-bold leading-none tracking-[-0.02em] tabular-nums text-foreground">
        {value}
      </div>
      {delta ? (
        <div
          className={cn(
            "mt-1 font-mono text-[11px]",
            delta.dir === "up" ? "text-success" : "text-destructive",
          )}
        >
          {delta.dir === "up" ? "▲" : "▼"} {delta.label}
        </div>
      ) : null}
    </div>
  );
}
