import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStateName } from "@/lib/constants";
import { classifyFreshness, type RefreshFrequency } from "@/lib/dashboard/freshness";
import type { StateHealthMap } from "@/lib/dashboard/types";

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

  return (
    <div
      className={cn(
        "sticky top-0 z-10 -mx-6 mb-4 border-b px-6 py-3",
        hasRed
          ? "border-red-300 bg-red-50 dark:border-red-800/40 dark:bg-red-950/20"
          : "border-amber-300 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20",
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            hasRed
              ? "text-red-700 dark:text-red-400"
              : "text-amber-700 dark:text-amber-400",
          )}
        />
        <div>
          <p
            className={cn(
              "text-sm font-semibold",
              hasRed
                ? "text-red-700 dark:text-red-400"
                : "text-amber-800 dark:text-amber-300",
            )}
          >
            {hasRed
              ? "Data refresh is failing for some states"
              : "Data refresh is behind schedule for some states"}
          </p>
          <ul className="mt-1 space-y-0.5">
            {entries.map((e) => (
              <li key={e.name} className="text-sm text-foreground">
                <span className="font-medium">{e.name}</span>
                {" — "}
                {e.lastRefreshAt !== null ? (
                  <>
                    last refreshed{" "}
                    <time dateTime={e.lastRefreshAt}>
                      {new Date(e.lastRefreshAt).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                      })}
                    </time>
                    {e.staleDays !== null && e.staleDays > 0 && (
                      <span className="text-muted-foreground">
                        {" "}
                        ({e.staleDays}d ago)
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">no refresh data</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
