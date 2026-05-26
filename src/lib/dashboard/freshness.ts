/**
 * Per-record freshness classification, cadence-aware.
 *
 * Dispatch §12.2 specified flat bands (24h / 3d / 7d). That works for
 * daily-cadence states but mis-flags weekly/monthly/quarterly states as
 * red when they're actually healthy. We scale the bands per state's
 * refresh_frequency. The "Refreshed as it posts" marketing framing
 * (foretab.com) corresponds to this — different states post at
 * different cadences; freshness is relative to the cadence.
 *
 * Two distinct signals on the dashboard:
 *   1. Per-record badge — computed from last_refresh_at vs cadence.
 *      Customer-facing freshness perception.
 *   2. Degraded-state banner — driven by data_source_health.status set
 *      by the ingest pipeline (green/yellow/red). Operator-flagged
 *      degradation regardless of age (e.g., consistent scrape failures
 *      where the last successful refresh was recent).
 *
 * Both surface; they overlap but aren't identical.
 */

export type RefreshFrequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "annual"
  | "on_request";

export type FreshnessLevel = "green" | "yellow" | "orange" | "red" | "on_request" | "unknown";

/**
 * Days-since-last-refresh thresholds per cadence. Crossing a band drops
 * to the next tier (green → yellow → orange → red).
 *
 * Tuning rationale:
 *   - green band ~= one cadence window. A daily state at 24h is on-time;
 *     a weekly state at 7d is on-time.
 *   - yellow band ~= 2× cadence. One refresh missed; possibly being
 *     re-tried.
 *   - orange band ~= 3× cadence. Sustained delay; operator should look.
 *   - red beyond. Data is meaningfully stale for the cadence.
 */
const FRESHNESS_BANDS_DAYS: Record<
  Exclude<RefreshFrequency, "on_request">,
  { green: number; yellow: number; orange: number }
> = {
  daily: { green: 1, yellow: 3, orange: 7 },
  weekly: { green: 7, yellow: 14, orange: 21 },
  monthly: { green: 30, yellow: 45, orange: 60 },
  quarterly: { green: 90, yellow: 120, orange: 180 },
  annual: { green: 365, yellow: 400, orange: 450 },
};

export function classifyFreshness(opts: {
  refreshFrequency: RefreshFrequency | null;
  lastRefreshAt: string | null;
}): FreshnessLevel {
  if (opts.refreshFrequency === "on_request") return "on_request";
  if (!opts.refreshFrequency) return "unknown";
  if (!opts.lastRefreshAt) return "unknown";

  const ageDays =
    (Date.now() - new Date(opts.lastRefreshAt).getTime()) / (24 * 60 * 60 * 1000);
  const bands = FRESHNESS_BANDS_DAYS[opts.refreshFrequency];

  if (ageDays <= bands.green) return "green";
  if (ageDays <= bands.yellow) return "yellow";
  if (ageDays <= bands.orange) return "orange";
  return "red";
}

/**
 * Customer-facing label for the freshness badge.
 *
 * For on_request states (NV's per-jurisdiction tracking): "Refreshed on
 * demand" — there's no schedule to be late against.
 *
 * For all other cadences: relative time bucketed naturally (hours, days,
 * weeks, calendar date). Granularity is intentionally coarse —
 * "Verified 3h ago" is more honest than "Verified 3h 12m ago" since the
 * underlying ingest job runs on a cron, not continuously.
 */
export function formatFreshnessLabel(opts: {
  level: FreshnessLevel;
  lastRefreshAt: string | null;
}): string {
  if (opts.level === "on_request") return "Refreshed on demand";
  if (opts.level === "unknown" || !opts.lastRefreshAt) return "Last refresh unknown";

  const ts = new Date(opts.lastRefreshAt);
  const ageMs = Date.now() - ts.getTime();
  const ageHours = ageMs / (60 * 60 * 1000);
  const ageDays = ageMs / (24 * 60 * 60 * 1000);

  if (ageHours < 1) return "Verified moments ago";
  if (ageHours < 24) return `Verified ${Math.floor(ageHours)}h ago`;
  if (ageDays < 7) return `Verified ${Math.floor(ageDays)}d ago`;
  if (ageDays < 30) return `Verified ${Math.floor(ageDays / 7)}w ago`;
  return `Verified ${ts.toLocaleDateString()}`;
}

/**
 * Maps the freshness level to the Badge variant we use elsewhere on
 * the dashboard. Badge primitive only knows about a fixed set of
 * variants; here's the freshness→variant mapping.
 *
 *   green → cold     (calm, "everything's fine" cool gray)
 *   yellow → warm    (amber: a notice, not alarm)
 *   orange → warm    (amber: same family; only the label differs)
 *   red → hot        (red surface from existing variant)
 *   on_request → outline  (no schedule; informational)
 *   unknown → outline     (defensive)
 */
export function freshnessBadgeVariant(
  level: FreshnessLevel,
): "cold" | "warm" | "hot" | "outline" {
  switch (level) {
    case "green":
      return "cold";
    case "yellow":
    case "orange":
      return "warm";
    case "red":
      return "hot";
    case "on_request":
    case "unknown":
      return "outline";
  }
}
