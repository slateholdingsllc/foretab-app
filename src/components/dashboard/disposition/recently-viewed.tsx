import type { RecentlyViewedBusinessRow } from "@/lib/disposition/types";
import { SignalTier } from "./signal-tier";

/**
 * RecentlyViewed — horizontal rail of the rep's last-opened businesses
 * (getRecentlyViewed → RecentlyViewedBusinessRow). The row carries no
 * disposition status, so chips show signal tier + viewed time only.
 *
 * NOTE: actions.ts currently returns signal_strength = null (deferred to
 * PR-2), so chips render the SignalTier "Unrated" state today. Once the
 * column is joined the same chip lights up with its tier — no UI change
 * needed here.
 */
export function RecentlyViewed({ items }: { items: RecentlyViewedBusinessRow[] }) {
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h3 className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-foreground-muted">
        <ClockIcon />
        Recently viewed
      </h3>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {items.map((item) => (
          <Chip key={item.business_id} item={item} />
        ))}
      </div>
    </section>
  );
}

function Chip({ item }: { item: RecentlyViewedBusinessRow }) {
  return (
    <button
      type="button"
      className="w-[168px] shrink-0 rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-surface-3"
    >
      <div className="truncate text-sm font-medium tracking-[-0.01em] text-foreground">
        {item.display_name}
      </div>
      <div className="mt-2">
        <SignalTier signal={item.signal_strength} className="px-1.5 py-px text-[9px]" />
      </div>
      <div className="mt-2 font-mono text-[9.5px] tracking-[0.04em] text-foreground-subtle">
        Viewed {relative(item.last_viewed_at)}
      </div>
    </button>
  );
}

function relative(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}
