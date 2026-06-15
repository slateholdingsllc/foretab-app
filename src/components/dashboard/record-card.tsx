import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getRecordSourceLabel } from "@/lib/dashboard/state-display";
import type { DashboardRecord, StateHealthEntry } from "@/lib/dashboard/types";
import { PROTECTED_DISPOSITION_STATUSES } from "@/lib/dashboard/types";
import { FreshnessBadge } from "./freshness-badge";
import { RecordDispositionStrip } from "./record-disposition-strip";
import { SignalBadge } from "./signal-badge";

/**
 * Per-record card. Renders one classified_record + its joined business +
 * location.
 *
 * Typography per the §2 type spec:
 *   - Business name → text-base (15px) Geist Medium, tight tracking.
 *     NOT semibold — semibold reads as marketing-card heaviness.
 *   - DBA → mono-prefixed inline meta line, --fg-muted.
 *   - Address → text-sm --fg-muted (was sm muted-foreground; same token).
 *   - Footer source label + freshness → mono 11px, uppercase eyebrow tone.
 *
 * Badge usage:
 *   - SignalBadge stays top-right (the load-bearing signal).
 *   - license_record_type uses default — generic categorical tag.
 *   - business_archetype + beverage_scope + on/off-prem use outline —
 *     these are facets, not the primary signal.
 *   - icp_relevance uses soft — accent-tint so ICP tags pop without
 *     competing with the SignalBadge.
 *
 * Freshness (Task 15): the per-state "last verified" badge is driven by
 * data_source_health.last_refresh_at (joined to states.refresh_frequency
 * for cadence-aware thresholds). When health is unavailable (missing
 * entry), the badge degrades to "Last refresh unknown" — never silently
 * hides the freshness signal.
 *
 * SPOTLIGHT overlay (visual only): the card now rides the warm-paper
 * surface + rounded-xl Card + pill Badges from the primitive re-skin.
 * The one card-local change is the business name — stepped up to
 * text-[17px] semibold to carry the marketing site's bolder, larger
 * heading voice (the §2 "not semibold" rule is intentionally superseded
 * by the Spotlight direction). Content, data, and logic are untouched.
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

  const primaryName =
    business?.primary_legal_name ?? record.business_name ?? "Unknown business";
  const dba = business?.primary_dba_name ?? record.dba_name;
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

  // Task 4: surface a "License inactive" callout when a card is shown
  // ONLY because of the protected-disposition override (rep is tracking
  // this lead but its license has flipped to Inactive). Without history we
  // can't show a true was-Active-now-Inactive transition arrow; this is
  // the practical signal that protects the rep from a silent vanish.
  const dispositionStatus = record.disposition?.status ?? null;
  const showInactiveDispositionedWarning =
    record.customer_status === "Inactive" &&
    dispositionStatus !== null &&
    (PROTECTED_DISPOSITION_STATUSES as readonly string[]).includes(
      dispositionStatus,
    );

  return (
    <Card className="transition-colors hover:border-surface-3">
      <CardContent className="space-y-3 p-5">
        {showInactiveDispositionedWarning ? (
          <div className="flex items-center gap-2">
            <Badge variant="hot">License inactive</Badge>
            <span className="text-xs text-foreground-2">
              Still in your pipeline
            </span>
          </div>
        ) : null}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <h3 className="truncate text-[17px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
              {primaryName}
            </h3>
            {dba && dba !== primaryName ? (
              <p className="truncate font-mono text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                DBA · {dba}
              </p>
            ) : null}
          </div>
          <SignalBadge signal={record.signal_strength} />
        </div>

        {record.signal_strength_reason ? (
          <p className="text-sm italic leading-relaxed text-muted-foreground">
            <span aria-hidden="true">↳ </span>
            {record.signal_strength_reason}
          </p>
        ) : null}

        {address ? (
          <p className="text-sm leading-relaxed text-foreground-2">{address}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          {record.license_record_type ? (
            <Badge variant="default" className="capitalize">
              {record.license_record_type.replace(/_/g, " ")}
            </Badge>
          ) : null}
          {record.lead_type === "event" ? (
            <Badge variant="outline" className="border-amber-500/60 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
              Event
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
                <Badge key={icp} variant="soft" className="capitalize">
                  {icp.replace(/_/g, " ")}
                </Badge>
              ))
            : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-soft pt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
          <span>{sourceLabel}</span>
          <FreshnessBadge
            refreshFrequency={health?.refresh_frequency ?? null}
            lastRefreshAt={health?.last_refresh_at ?? null}
          />
        </div>
      </CardContent>

      {/* Disposition strip + slide-over. RecordDispositionStrip owns the
          panel's open-state and lazy-mounts DetailPanel on first open.
          Self-skips when there's no parent business. */}
      <RecordDispositionStrip record={record} />
    </Card>
  );
}
