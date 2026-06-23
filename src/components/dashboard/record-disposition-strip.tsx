"use client";

import * as React from "react";
import type { BusinessDisposition, DispositionStatus } from "@/lib/disposition/types";
import type { DashboardRecord } from "@/lib/dashboard/types";
import { DetailPanel } from "./disposition/detail-panel";
import { DispositionRow } from "./disposition/disposition-row";

/**
 * Client wrapper that pairs each record's DispositionRow with its
 * DetailPanel slide-over and owns the open-state. Wires
 * DispositionRow.onOpen (the no-op stub from PR #26) to actually open
 * the panel.
 *
 * Lazy-mount: the panel doesn't enter the DOM until first open. After
 * that it stays mounted so the slide-out animation has something to
 * transition. Avoids 50 dormant `fixed inset-0 z-50` overlays for cards
 * the rep never clicks.
 *
 * Per-card open-state is fine here — only one panel can be visually
 * active at a time anyway (scrim covers everything), so concurrent
 * panels never overlap interactively. If a global "only one open"
 * coordinator becomes needed later, lift to a context at the dashboard.
 *
 * confirmedStatus: because mutations no longer call revalidatePath('/'),
 * record.disposition stays at its RSC-snapshot value until navigation.
 * We track the last server-confirmed status here so the DetailPanel's
 * useEffect([open, disposition]) resets to the correct status instead
 * of the stale RSC value.
 *
 * Returns null when there's no parent business — dispositions key on
 * business_id and a record without one can't be dispositioned.
 */
export function RecordDispositionStrip({ record }: { record: DashboardRecord }) {
  const business = record.business;
  const [open, setOpen] = React.useState(false);
  const [hasOpened, setHasOpened] = React.useState(false);
  const [confirmedStatus, setConfirmedStatus] = React.useState<DispositionStatus>(
    record.disposition?.status ?? "uncontacted",
  );

  if (!business?.id) return null;

  const displayName =
    business.primary_legal_name ?? record.business_name ?? "Unknown business";
  const dba = business.primary_dba_name ?? record.dba_name;

  // Build an effective disposition for the panel that reflects any
  // strip-level status changes made since the RSC rendered.
  const effectiveDisposition: BusinessDisposition | null = record.disposition
    ? { ...record.disposition, status: confirmedStatus }
    : confirmedStatus !== "uncontacted"
      ? {
          // Placeholder for newly-created disposition rows — these fields
          // are not used by the panel for display or mutation.
          id: "",
          customer_id: "",
          business_id: business.id,
          status: confirmedStatus,
          notes: null,
          follow_up_at: null,
          last_touched_at: null,
          last_touch_kind: null,
          lost_reason: null,
          created_at: "",
          updated_at: "",
        }
      : null;

  // Facets shown in the panel header — match what the card's badge row
  // already surfaces, so opening the panel doesn't introduce new
  // categorical dimensions out of nowhere.
  const facets: string[] = [];
  if (record.license_record_type) facets.push(record.license_record_type);
  if (record.business_archetype) facets.push(record.business_archetype);
  if (record.beverage_scope && record.beverage_scope !== "unknown") {
    facets.push(record.beverage_scope);
  }
  if (record.on_premises === true) facets.push("on_prem");
  if (record.off_premises === true) facets.push("off_prem");
  for (const icp of record.icp_relevance) facets.push(icp);

  function handleOpen() {
    setHasOpened(true);
    setOpen(true);
  }

  return (
    <>
      <DispositionRow
        businessId={business.id}
        disposition={record.disposition}
        noteCount={record.disposition?.notes ? 1 : 0}
        onOpen={handleOpen}
        onStatusConfirmed={setConfirmedStatus}
      />
      {hasOpened ? (
        <DetailPanel
          open={open}
          businessId={business.id}
          classifiedRecordId={record.id}
          displayName={displayName}
          dba={dba}
          facets={facets}
          signal={record.signal_strength}
          signalReason={record.signal_strength_reason}
          disposition={effectiveDisposition}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
