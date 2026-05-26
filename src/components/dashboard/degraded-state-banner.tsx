import { Alert, AlertDescription } from "@/components/ui/alert";
import { getStateName } from "@/lib/constants";
import type { StateHealthMap } from "@/lib/dashboard/types";

/**
 * Banner shown above the feed when any of the customer's accessible
 * states is in degraded health status (data_source_health.status
 * yellow or red). The signal here is OPERATOR-set, not customer-
 * computed from age — Phase 1 ingestion sets status based on scrape
 * outcomes, and a state can be in degraded status even if its
 * last_refresh_at was recent (e.g., the most recent run errored).
 *
 * If no degraded states, this component renders nothing.
 *
 * Per dispatch §12.2: "For states with known degraded status... show a
 * dashboard banner: 'Rhode Island data is currently degraded due to a
 * state agency system migration. Last verified: [date].'" — we
 * generalize the pattern across all degraded states the customer
 * accesses.
 */
export function DegradedStateBanner({ healthMap }: { healthMap: StateHealthMap }) {
  const degraded = Array.from(healthMap.values()).filter(
    (h) => h.status === "yellow" || h.status === "red",
  );
  if (degraded.length === 0) return null;

  return (
    <Alert className="mb-4">
      <AlertDescription>
        <p className="text-sm font-medium">
          {degraded.length === 1
            ? "Heads up: one of your states has a data refresh issue."
            : `Heads up: ${degraded.length} of your states have data refresh issues.`}
        </p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {degraded.map((h) => (
            <li key={h.state_id}>
              <span className="font-medium text-foreground">
                {getStateName(h.state_code ?? "") ?? h.state_code}
              </span>
              {" — "}
              {h.status === "red" ? (
                <>data ingest is currently failing</>
              ) : (
                <>recent ingest errors</>
              )}
              {h.last_refresh_at ? (
                <>
                  ; last successful refresh{" "}
                  <time dateTime={h.last_refresh_at}>
                    {new Date(h.last_refresh_at).toLocaleDateString()}
                  </time>
                </>
              ) : null}
              .
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          We&apos;re aware and working on it. Records for these states are still
          shown but may not include the latest licenses.
        </p>
      </AlertDescription>
    </Alert>
  );
}
