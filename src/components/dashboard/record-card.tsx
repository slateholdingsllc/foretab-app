import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getRecordSourceLabel } from "@/lib/dashboard/state-display";
import type { DashboardRecord } from "@/lib/dashboard/types";
import { SignalBadge } from "./signal-badge";

/**
 * Per-record card. Renders one classified_record + its joined business +
 * location. "Last verified" is Task 15 prep — for now we show
 * classified_at as the freshness proxy. When Task 15 ships, it swaps to
 * data_source_health.last_refresh_at lookup per state.
 *
 * data_source_channel slot is RESERVED — rendered as a muted line below
 * the source label, currently always showing the state-derived label
 * (e.g., "Michigan ABC, via PRR" for MI). When Agent A adds the
 * data_source_channel column to classified_records, the slot will
 * show channel-specific strings per record (e.g., "Florida, via Socrata").
 */
export function RecordCard({ record }: { record: DashboardRecord }) {
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
          <span>
            Last verified <RelativeTime iso={record.classified_at} />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Relative time — server-rendered, so customer sees the same value as
 * when the page loaded. No client refresh; an explicit page reload
 * picks up the latest. Avoids hydration mismatch from client clock.
 */
function RelativeTime({ iso }: { iso: string }) {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const hours = Math.round(diff / (60 * 60 * 1000));
  const days = Math.round(diff / (24 * 60 * 60 * 1000));
  let label: string;
  if (hours < 1) label = "moments ago";
  else if (hours < 24) label = `${hours}h ago`;
  else if (days < 30) label = `${days}d ago`;
  else label = date.toLocaleDateString();
  return <time dateTime={iso}>{label}</time>;
}
