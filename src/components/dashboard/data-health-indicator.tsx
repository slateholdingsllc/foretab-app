import { getStateName } from "@/lib/constants";
import { classifyFreshness, type RefreshFrequency } from "@/lib/dashboard/freshness";
import type { StateHealthMap } from "@/lib/dashboard/types";
import {
  DataHealthHeartbeat,
  type HealthSeverity,
  type HealthStateEntry,
} from "./data-health-heartbeat";

/**
 * Server wrapper for the data-health heartbeat. Computes overall severity
 * and the per-state degraded list from the StateHealthMap, then hands them
 * to the client pulse.
 *
 * This is the SAME signal-combination DegradedStateBanner used (operator
 * status + cadence-aware freshness), with one difference: the heartbeat
 * ALWAYS renders. When every state is healthy it shows the quiet green
 * standing pulse; the banner returned null. Keeping the logic identical
 * means the two can't disagree during the migration.
 *
 * Severity:
 *   red    = any state red freshness OR operator status=red
 *   amber  = any state yellow/orange freshness OR operator status=yellow
 *   healthy = none of the above
 *
 * `variant` picks the sidebar (desktop) or top-bar (mobile) presentation;
 * mount both — they share this computed input.
 */
export function DataHealthIndicator({
  healthMap,
  variant = "sidebar",
  className,
}: {
  healthMap: StateHealthMap;
  variant?: "sidebar" | "topbar";
  className?: string;
}) {
  const entries: HealthStateEntry[] = [];
  let anyRed = false;
  let anyAmber = false;

  for (const h of healthMap.values()) {
    const freshness = classifyFreshness({
      refreshFrequency: h.refresh_frequency as RefreshFrequency | null,
      lastRefreshAt: h.last_refresh_at,
    });

    const isRed = h.status === "red" || freshness === "red";
    const isAmber =
      !isRed &&
      (h.status === "yellow" || freshness === "yellow" || freshness === "orange");

    if (!isRed && !isAmber) continue;

    if (isRed) anyRed = true;
    else anyAmber = true;

    const staleDays =
      h.last_refresh_at !== null
        ? Math.floor(
            (Date.now() - new Date(h.last_refresh_at).getTime()) /
              (24 * 60 * 60 * 1000),
          )
        : null;

    entries.push({
      code: h.state_code ?? "??",
      name: getStateName(h.state_code ?? "") ?? h.state_code ?? "Unknown",
      severity: isRed ? "red" : "amber",
      staleDays,
      lastRefreshAt: h.last_refresh_at,
    });
  }

  // Sort worst-first so the most urgent state leads the popover.
  entries.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "red" ? -1 : 1;
    return (b.staleDays ?? 0) - (a.staleDays ?? 0);
  });

  const severity: HealthSeverity = anyRed ? "red" : anyAmber ? "amber" : "healthy";

  return (
    <DataHealthHeartbeat
      severity={severity}
      entries={entries}
      totalStates={healthMap.size}
      variant={variant}
      className={className}
    />
  );
}
