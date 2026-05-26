import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getRecordSourceLabel } from "@/lib/dashboard/state-display";
import type { DashboardRecord, StateHealthEntry } from "@/lib/dashboard/types";
import { FreshnessBadge } from "./freshness-badge";
import { SignalBadge } from "./signal-badge";

/**
 * Per-record card. Renders one classified_record + its joined business +
 * location.
 *
 * Freshness (Task 15): the per-state "last verified" badge is driven by
 * data_source_health.last_refresh_at (joined to states.refresh_frequency
 * for cadence-aware thresholds). Caller passes the relevant StateHealthEntry
 * pulled from the StateHealthMap by record.state_id. When health is
 * unavailable (missing entry), the badge degrades to "Last refresh unknown"
 * — never silently hides the freshness signal.
 *
 * data_source_channel slot is RESERVED — rendered in the source label,
 * always showing the state-derived label (e.g., "Michigan ABC, via PRR"
 * for MI). When Agent A adds the data_source_channel column to
 * classified_records, the slot will show channel-specific strings.
 */
export function RecordCard({
  record,
  health,
}: {
  record: DashboardRecord;
  health: StateHealthEntry | null;
}) {
  const business = record.business;
  const location = record.location;

  const primaryName = business?.primary_legal_name ?? "Unknown business";
  const dba = business?.primary_dba_name;
  const addressParts = [
    location?.street ?? location?.normalized_address,
    location?.city,
    location?.state_code,
    location?.zip,
  ].filter(Boolean);
  const address = addressParts.join(", ");

  const sourceLabel = getRecordSourceLabel({
    stateCode: record.state_code,
    dataSourceChannel: record.data_source_channel,
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">{primaryName}</h3>
            {dba && dba !== primaryName ? (
              <p className="truncate text-sm text-muted-foreground">DBA {dba}</p>
            ) : null}
          </div>
          <SignalBadge signal={record.signal_strength} />
        </div>

        {address ? <p className="text-sm text-muted-foreground">{address}</p> : null}

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {record.license_record_type ? (
            <Badge variant="default" className="capitalize">
              {record.license_record_type.replace(/_/g, " ")}
            </Badge>
          ) : null}
          {record.business_archetype ? (
            <Badge variant="outline" className="capitalize">
              {record.business_archetype.replace(/_/g, " ")}
            </Badge>
          ) : null}
          {record.beverage_scope && record.beverage_scope !== "unknown" ? (
            <Badge variant="outline" className="capitalize">
              {record.beverage_scope.replace(/_/g, " ")}
            </Badge>
          ) : null}
          {record.on_premises === true ? (
            <Badge variant="outline">On-prem</Badge>
          ) : null}
          {record.off_premises === true ? (
            <Badge variant="outline">Off-prem</Badge>
          ) : null}
          {record.icp_relevance.length > 0
            ? record.icp_relevance.map((icp) => (
                <Badge key={icp} variant="default" className="capitalize">
                  {icp.replace(/_/g, " ")}
                </Badge>
              ))
            : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-input pt-3 text-xs text-muted-foreground">
          <span>{sourceLabel}</span>
          <FreshnessBadge
            refreshFrequency={health?.refresh_frequency ?? null}
            lastRefreshAt={health?.last_refresh_at ?? null}
          />
        </div>
      </CardContent>
    </Card>
  );
}
