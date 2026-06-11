import { getStateName } from "@/lib/constants";
import { classifyFreshness, type RefreshFrequency } from "@/lib/dashboard/freshness";
import type { StateHealthMap } from "@/lib/dashboard/types";
import { DegradedStateBannerClient } from "./degraded-state-banner-client";

/**
 * Sticky banner pinned above the feed when any accessible state has stale
 * or degraded data.
 *
 * Two signals are combined:
 *   1. Operator-set status (yellow/red) — pipeline reported an error.
 *   2. Cadence-aware freshness (orange/red) — data is meaningfully late
 *      relative to the state's refresh schedule (e.g. daily state missing
 *      3+ runs triggers orange).
 *
 * Severity escalation:
 *   amber  = any state yellow/orange (behind schedule, not yet failing)
 *   red    = any state red freshness OR operator status=red (actively failing)
 *
 * No dismiss — stale data is a trust signal; customers must not be able
 * to accidentally hide it.
 */
export function DegradedStateBanner({ healthMap }: { healthMap: StateHealthMap }) {
  const entries: Array<{
    name: string;
    isRed: boolean;
    staleDays: number | null;
    lastRefreshAt: string | null;
  }> = [];

  for (const h of healthMap.values()) {
    const freshness = classifyFreshness({
      refreshFrequency: h.refresh_frequency as RefreshFrequency | null,
      lastRefreshAt: h.last_refresh_at,
    });

    const operatorDegraded = h.status === "yellow" || h.status === "red";
    const freshnessDegraded = freshness === "orange" || freshness === "red";
    if (!operatorDegraded && !freshnessDegraded) continue;

    const staleDays =
      h.last_refresh_at !== null
        ? Math.floor(
            (Date.now() - new Date(h.last_refresh_at).getTime()) /
              (24 * 60 * 60 * 1000),
          )
        : null;

    entries.push({
      name: getStateName(h.state_code ?? "") ?? h.state_code ?? "Unknown",
      isRed: h.status === "red" || freshness === "red",
      staleDays,
      lastRefreshAt: h.last_refresh_at,
    });
  }

  if (entries.length === 0) return null;

  const hasRed = entries.some((e) => e.isRed);

  return <DegradedStateBannerClient entries={entries} hasRed={hasRed} />;
}
