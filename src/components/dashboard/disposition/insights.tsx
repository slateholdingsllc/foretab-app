import { cn } from "@/lib/utils";
import type {
  ActivityDay,
  DispositionFunnelData,
  SignalWinRateRow,
} from "@/lib/disposition/types";
import { SignalIcon } from "./signal-tier";

/**
 * Insights — three charts off the insights.queries.ts aggregate shapes.
 * Re-skinned from the pack's hardcoded-hex SVG to design tokens, so every
 * fill is theme-aware. Funnel + activity ride accent / accent-tint; the
 * win-rate-by-signal is the one place the signal ramp earns its third hue.
 */
export function Insights({
  funnel,
  winRate,
  activity,
}: {
  funnel: DispositionFunnelData;
  winRate: SignalWinRateRow[];
  activity: ActivityDay[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
      <Card title="Pipeline funnel" sub="Distinct businesses">
        <Funnel data={funnel} />
      </Card>
      <Card title="Win rate by signal" sub="SignalWinRateRow">
        <WinRate rows={winRate} />
      </Card>
      <Card title="Activity" sub="Dispositions · 30 days">
        <Activity days={activity} />
      </Card>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5 rounded-lg border border-border bg-card p-4">
      <header className="flex flex-col gap-0.5">
        <span className="text-sm font-medium tracking-[-0.01em] text-foreground">{title}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-foreground-muted">{sub}</span>
      </header>
      {children}
    </section>
  );
}

function Funnel({ data }: { data: DispositionFunnelData }) {
  const max = Math.max(data.surfaced, 1);
  const stages: { label: string; value: number; won?: boolean }[] = [
    { label: "Surfaced", value: data.surfaced },
    { label: "Saved", value: data.saved },
    { label: "Engaged", value: data.engaged },
    { label: "Won", value: data.won, won: true },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      {stages.map((s) => (
        <div key={s.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between font-mono text-[10.5px] tracking-[0.04em]">
            <span className="uppercase text-foreground-2">{s.label}</span>
            <span className="font-medium text-foreground">{s.value}</span>
          </div>
          <div
            className={cn("h-[22px] rounded-sm", s.won ? "bg-success" : "bg-accent")}
            style={{ width: `${Math.max(4, (s.value / max) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function WinRate({ rows }: { rows: SignalWinRateRow[] }) {
  // Fill color follows the signal ramp: New=accent, Established=accent-soft,
  // Dormant=muted. Track is surface-2.
  const fill: Record<string, string> = {
    New: "bg-accent",
    Established: "bg-accent-soft",
    Dormant: "bg-foreground-muted",
  };
  return (
    <div className="flex flex-col gap-3.5 pt-0.5">
      {rows.map((r) => {
        const pct = r.total > 0 ? Math.round((r.won / r.total) * 100) : 0;
        return (
          <div key={r.signal} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.05em] text-foreground-2">
                <SignalIcon signal={r.signal} className={cn("h-3 w-3", r.signal === "Dormant" ? "text-foreground-muted" : "text-primary")} />
                {r.signal}
              </span>
              <span className="font-mono text-[13px] font-medium text-foreground">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className={cn("h-full rounded-full", fill[r.signal])} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Activity({ days }: { days: ActivityDay[] }) {
  const max = Math.max(...days.map((d) => d.count), 1);
  const peak = max;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex h-24 items-end gap-[3px]">
        {days.map((d) => {
          const h = Math.max(3, (d.count / max) * 100);
          const isPeak = d.count === peak && peak > 0;
          return (
            <div
              key={d.date}
              title={`${d.date} · ${d.count}`}
              className={cn("min-h-[3px] flex-1 rounded-t-sm", isPeak ? "bg-accent" : "bg-accent-tint")}
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
      <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.06em] text-foreground-subtle">
        <span>{days[0]?.date ?? ""}</span>
        <span>{days[days.length - 1]?.date ?? ""}</span>
      </div>
      <div className="flex gap-3.5 font-mono text-[10px] tracking-[0.04em] text-foreground-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[9px] w-[9px] rounded-sm bg-accent" />Peak day
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[9px] w-[9px] rounded-sm bg-accent-tint" />Daily count
        </span>
      </div>
    </div>
  );
}
