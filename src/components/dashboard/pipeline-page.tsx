import { Insights } from "@/components/dashboard/disposition";
import type {
  ActivityDay,
  DispositionFunnelData,
  SignalWinRateRow,
} from "@/lib/disposition/types";
import type { DispositionStatus } from "@/lib/disposition/types";

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

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 px-5 py-6 lg:px-8 lg:py-8">
      {/* Page heading */}
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.025em] text-foreground">
          Pipeline
        </h1>
        <p className="mt-1 text-sm text-foreground-2">
          Funnel health, win rate by signal, and 30-day activity.
        </p>
      </div>

      {/* KPI strip — 4 tiles, 2-up on mobile, 4-up on sm+ */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <KpiTile label="In pipeline" value={funnel.surfaced} />
        <KpiTile label="Working" value={statusCounts?.working ?? 0} />
        <KpiTile label="Won · 30d" value={won} />
        <KpiTile label="Win rate" value={`${winRatePct}%`} />
      </div>

      {/* Full-width 3-up Insights grid.
          <Insights> is grid-cols-1 md:grid-cols-3 — at full viewport width
          (no sidebar) the three panels get genuine room. */}
      <Insights funnel={funnel} winRate={winRate} activity={activity} className="grid grid-cols-1 gap-3.5 md:grid-cols-[1.5fr_1fr_1.2fr]" />
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
    <div className="rounded-xl border border-border bg-card px-3.5 py-3">
      <div className="font-mono text-[12px] uppercase tracking-[0.05em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-[27px] font-bold leading-none tracking-[-0.02em] tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}
