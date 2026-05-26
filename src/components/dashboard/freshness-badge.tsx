import { Badge } from "@/components/ui/badge";
import {
  type RefreshFrequency,
  classifyFreshness,
  formatFreshnessLabel,
  freshnessBadgeVariant,
} from "@/lib/dashboard/freshness";

/**
 * Per-record freshness pill. Replaces the placeholder "Last verified"
 * timestamp from PR #6 with the cadence-aware classification.
 *
 * Inputs come from data_source_health joined to states (refresh_frequency
 * for cadence-aware bands, last_refresh_at for age). Caller pulls these
 * from the StateHealthMap by record.state_id.
 *
 * For on_request states (NV) the label is "Refreshed on demand" — there's
 * no schedule to be late against.
 */
export function FreshnessBadge({
  refreshFrequency,
  lastRefreshAt,
}: {
  refreshFrequency: string | null;
  lastRefreshAt: string | null;
}) {
  const level = classifyFreshness({
    refreshFrequency: refreshFrequency as RefreshFrequency | null,
    lastRefreshAt,
  });
  const variant = freshnessBadgeVariant(level);
  const label = formatFreshnessLabel({ level, lastRefreshAt });

  return <Badge variant={variant}>{label}</Badge>;
}
