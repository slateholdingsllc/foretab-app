import Link from "next/link";
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
  workingCount,
  className,
}: {
  funnel: DispositionFunnelData;
  winRate: SignalWinRateRow[];
  activity: ActivityDay[];
  /** statusCounts.working — threads in from PipelinePage so the funnel label
   *  matches the Worklist status pills exactly. Falls back to data.engaged
   *  when not passed (e.g. cockpit-band context). */
  workingCount?: number;
  className?: string;
}) {
  return (
    <div className={className ?? "grid grid-cols-1 gap-3.5 md:grid-cols-3"}>
      <Card title="Pipeline funnel" sub="Distinct businesses">
        <Funnel data={funnel} workingCount={workingCount} />
      </Card>
      <Card title="Win rate by signal" sub="Won ÷ in scope · by tier">
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
    <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card p-5">
      <header className="mb-4 flex shrink-0 flex-col gap-1">
        <span className="text-[17px] font-semibold tracking-[-0.015em] text-foreground">{title}</span>
        <span className="font-mono text-[13px] uppercase tracking-[0.07em] text-foreground-muted">{sub}</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </section>
  );
}

function Funnel({ data, workingCount }: { data: DispositionFunnelData; workingCount?: number }) {
  const max = Math.max(data.surfaced, 1);
  const stages: { label: string; value: number; won?: boolean; href: string }[] = [
    { label: "Surfaced", value: data.surfaced,                      href: "/" },
    { label: "Saved",    value: data.saved,                         href: "/?tab=saved" },
    { label: "Working",  value: workingCount ?? data.engaged,        href: "/?tab=working" },
    { label: "Won",      value: data.won,       won: true,           href: "/?tab=won" },
  ];
  return (
    <div className="flex flex-1 flex-col justify-evenly">
      {stages.map((s) => (
        <Link
          key={s.label}
          href={s.href}
          className="group flex flex-col gap-2 no-underline"
        >
          <div className="flex items-baseline justify-between font-mono text-[14px] tracking-[0.03em]">
            <span className="font-medium uppercase text-foreground-2 transition-colors group-hover:text-foreground">
              {s.label}
            </span>
            <span className="font-semibold text-foreground">{s.value.toLocaleString()}</span>
          </div>
          <div
            className={cn(
              "h-[40px] rounded-sm transition-opacity group-hover:opacity-75",
              s.won ? "bg-success" : "bg-accent",
            )}
            style={{ width: `${Math.max(4, (s.value / max) * 100)}%` }}
          />
        </Link>
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
    <div className="flex flex-1 flex-col justify-evenly pt-1">
      {rows.map((r) => {
        const pct = r.total > 0 ? Math.round((r.won / r.total) * 100) : 0;
        return (
          <Link
            key={r.signal}
            href={`/?tab=won&signal=${r.signal}`}
            className="group flex flex-col gap-2.5 no-underline"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 font-mono text-[14px] font-medium uppercase tracking-[0.04em] text-foreground-2 transition-colors group-hover:text-foreground">
                <SignalIcon signal={r.signal} className={cn("h-3.5 w-3.5", r.signal === "Dormant" ? "text-foreground-muted" : "text-primary")} />
                {r.signal}
              </span>
              <span className="font-mono text-[16px] font-semibold text-foreground">{pct}%</span>
            </div>
            <div className="h-4 overflow-hidden rounded bg-surface-2">
              <div
                className={cn("h-full rounded transition-opacity group-hover:opacity-75", fill[r.signal])}
                style={{ width: `${pct}%` }}
              />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function Activity({ days }: { days: ActivityDay[] }) {
  const max = Math.max(...days.map((d) => d.count), 1);
  const peak = max;
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-1 min-h-[120px] items-end gap-[3px]">
        {days.map((d) => {
          const h = Math.max(3, (d.count / max) * 100);
          const isPeak = d.count === peak && peak > 0;
          return (
            <Link
              key={d.date}
              href="/"
              title={`${d.date} · ${d.count}`}
              className={cn(
                "min-h-[3px] flex-1 rounded-t-sm no-underline transition-opacity hover:opacity-75",
                isPeak ? "bg-accent" : "bg-accent-tint",
              )}
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
      <div className="flex justify-between font-mono text-[12px] uppercase tracking-[0.05em] text-foreground-subtle">
        <span>{days[0]?.date ?? ""}</span>
        <span>{days[days.length - 1]?.date ?? ""}</span>
      </div>
      <div className="flex gap-4 font-mono text-[12px] tracking-[0.04em] text-foreground-muted">
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
