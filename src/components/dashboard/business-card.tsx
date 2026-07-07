import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getRecordSourceLabel } from "@/lib/dashboard/state-display";
import { stateCodeToName } from "@/lib/dashboard/state-names";
import type { DashboardRecord, StateHealthEntry } from "@/lib/dashboard/types";
import { FreshnessBadge } from "./freshness-badge";
import { RecordDispositionStrip } from "./record-disposition-strip";
import { SignalBadge } from "./signal-badge";
import { BusinessCardHistory } from "./business-card-history";

/**
 * Business-grain card. One card per account (business) — the headline record
 * is the freshest qualifying signal; prior license events expand underneath.
 *
 * Disposition is already keyed at business grain (customer_business_disposition
 * uses business_id), so RecordDispositionStrip works unchanged on the headline.
 *
 * Design: same visual language as RecordCard. Signal badge stays top-right.
 * customer_status badge surfaces below the signal badge when non-Active
 * (Pending, Suspended). Active is the expected state in Opening Now mode and
 * doesn't need a badge — noise-free baseline.
 */
export function BusinessCard({
  headline,
  others,
  health,
}: {
  headline: DashboardRecord;
  others: DashboardRecord[];
  health: StateHealthEntry | null;
}) {
  const business = headline.business;
  const location = headline.location;

  const primaryName =
    business?.primary_legal_name ?? headline.business_name ?? "Unknown business";
  const dba = business?.primary_dba_name ?? headline.dba_name;
  const addressParts = [
    location?.street ?? location?.normalized_address,
    location?.city,
    location?.state_code,
    location?.zip,
  ].filter(Boolean);
  const address = addressParts.join(", ");

  const sourceLabel = getRecordSourceLabel({
    stateCode: headline.state_code,
    dataSourceChannel: headline.data_source_channel,
  });

  return (
    <Card className="transition-colors hover:border-surface-3">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <h3 className="truncate text-[17px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
              {primaryName}
            </h3>
            {dba && dba !== primaryName ? (
              <p className="truncate font-mono text-[13px] uppercase tracking-[0.03em] text-muted-foreground">
                DBA · {dba}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <SignalBadge signal={headline.signal_strength} />
            {headline.customer_status && headline.customer_status !== "Active" ? (
              <CustomerStatusBadge status={headline.customer_status} />
            ) : null}
          </div>
        </div>

        {address ? (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="text-sm leading-relaxed text-foreground-2">{address}</p>
            {headline.in_state === false && headline.premises_state_code ? (
              <span className="font-mono text-[12px] uppercase tracking-[0.04em] text-foreground-muted">
                {stateCodeToName(headline.premises_state_code)} premises
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          {headline.license_record_type ? (
            <Badge variant="default" className="capitalize">
              {headline.license_record_type.replace(/_/g, " ")}
            </Badge>
          ) : null}
          {headline.lead_type === "event" ? (
            <Badge variant="outline" className="border-amber/40 bg-amber-tint text-amber">
              Event
            </Badge>
          ) : null}
          {headline.business_archetype ? (
            <Badge variant="outline" className="capitalize">
              {headline.business_archetype.replace(/_/g, " ")}
            </Badge>
          ) : null}
          {headline.beverage_scope && headline.beverage_scope !== "unknown" ? (
            <Badge variant="outline" className="capitalize">
              {headline.beverage_scope.replace(/_/g, " ")}
            </Badge>
          ) : null}
          {headline.icp_relevance.length > 0
            ? headline.icp_relevance.map((icp) => (
                <Badge key={icp} variant="soft" className="capitalize">
                  {icp.replace(/_/g, " ")}
                </Badge>
              ))
            : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-soft pt-3 font-mono text-[13px] uppercase tracking-[0.04em] text-muted-foreground">
          <span>{sourceLabel}</span>
          <FreshnessBadge
            refreshFrequency={health?.refresh_frequency ?? null}
            lastRefreshAt={health?.last_refresh_at ?? null}
          />
        </div>
      </CardContent>

      <RecordDispositionStrip record={headline} />

      {headline.business?.id ? (
        <BusinessCardHistory
          businessId={headline.business.id}
          headlineId={headline.id}
          knownOtherCount={others.length}
        />
      ) : null}
    </Card>
  );
}

function CustomerStatusBadge({
  status,
}: {
  status: NonNullable<DashboardRecord["customer_status"]>;
}) {
  const cls =
    status === "Pending"
      ? "bg-amber-tint text-amber border-amber/30"
      : status === "Suspended"
        ? "bg-destructive/10 text-destructive border-destructive/30"
        : "bg-surface-2 text-foreground-muted border-border";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[12px] uppercase tracking-[0.04em] ${cls}`}
    >
      {status}
    </span>
  );
}
