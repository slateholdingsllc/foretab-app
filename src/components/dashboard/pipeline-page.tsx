import { Insights } from "@/components/dashboard/disposition";
import type {
  ActivityDay,
  DispositionFunnelData,
  SignalWinRateRow,
  DispositionStatus,
} from "@/lib/disposition/types";

/**
 * PipelinePage — full-page analytics layout for /pipeline.
 *
 * Companion to the CockpitBand: same KPI tiles and the same <Insights>
 * 3-up grid, but given the full viewport width (no filter sidebar) and
 * generous vertical room. The band is the at-a-glance header; this page
 * is where the rep goes to reason about their funnel and signal health.
 *
 * Data: reuses getDispositionFunnel / getWinRateBySignal /
 * getActivityLast30Days — no new queries.
 */
const LOW_DATA_THRESHOLD = 5;

export function PipelinePage({
  funnel,
  winRate,
  activity,
  statusCounts,
}: {
  funnel: DispositionFunnelData;
  winRate: SignalWinRateRow[];
  activity: ActivityDay[];
  statusCounts: Record<DispositionStatus, number> | null;
}) {
  const won = statusCounts?.won ?? 0;
  const lost = statusCounts?.lost ?? 0;
  const winRatePct =
    won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0;
  const workingCount = statusCounts?.working ?? 0;

  // funnel.saved = distinct businesses with any active disposition status
  // (saved | working | won | lost). Below the threshold the derived rates
  // (win %, by-signal breakdown) are too noisy to be useful.
  const hasEnoughData = funnel.saved >= LOW_DATA_THRESHOLD;

  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 py-6 lg:px-8 lg:py-8">
      {/* Page heading */}
      <div className="shrink-0">
        <h1 className="text-[22px] font-bold tracking-[-0.025em] text-foreground">
          Pipeline
        </h1>
        <p className="mt-1 text-sm text-foreground-2">
          Funnel health, win rate by signal, and 30-day activity.
        </p>
      </div>

      {/* KPI strip — 4 tiles, 2-up on mobile, 4-up on sm+ */}
      <div className="mt-6 grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="In pipeline" value={funnel.surfaced} />
        <KpiTile label="Working" value={workingCount} />
        <KpiTile label="Won · 30d" value={won} />
        <KpiTile label="Win rate" value={`${winRatePct}%`} />
      </div>

      {/* Full-width 3-up Insights grid fills remaining viewport height */}
      {hasEnoughData ? (
        <Insights
          funnel={funnel}
          winRate={winRate}
          activity={activity}
          workingCount={workingCount}
          className="mt-6 grid min-h-0 flex-1 grid-cols-1 gap-3.5 md:grid-cols-[1.5fr_1fr_1.2fr]"
        />
      ) : (
        <PipelineLowData leadsInPipeline={funnel.saved} />
      )}
    </div>
  );
}

function KpiTile({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <div className="font-mono text-[11px] uppercase tracking-[0.07em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 text-[32px] font-bold leading-none tracking-[-0.025em] tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

function PipelineLowData({ leadsInPipeline }: { leadsInPipeline: number }) {
  const needed = LOW_DATA_THRESHOLD - leadsInPipeline;
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
      <p className="font-medium text-foreground">
        Pipeline stats unlock at {LOW_DATA_THRESHOLD} leads
      </p>
      <p className="max-w-xs text-sm leading-relaxed text-foreground-2">
        {leadsInPipeline === 0
          ? "Start working leads from your feed — save, work, or close a few to see funnel health, win rate, and activity."
          : `You have ${leadsInPipeline} lead${leadsInPipeline !== 1 ? "s" : ""} in your pipeline. Add ${needed} more to unlock the charts.`}
      </p>
    </div>
  );
}
