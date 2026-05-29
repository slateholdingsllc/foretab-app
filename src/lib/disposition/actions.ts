"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  ActivityTimelineRow,
  BusinessDisposition,
  DispositionStatus,
  LostReason,
  RecentlyViewedBusinessRow,
  TouchKind,
} from "./types";

/**
 * Phase 3 CRM — server actions + read helpers.
 *
 * Auth + writes both go through the user-authenticated client. The
 * disposition tables are user-CRUD by design (not service-role-write
 * per the migration), so calling `createClient()` is correct here —
 * NOT the pattern from selectTrialState which switches to service-role
 * for the privileged provisioning writes.
 *
 * Every mutation:
 *   1. Resolves the customer row from auth.uid().
 *   2. Writes the state change (upsert into customer_business_disposition).
 *   3. Writes an append-only event row (business_disposition_event for
 *      business-grain mutations, license_touch for per-event touches).
 *   4. revalidatePath('/') so the dashboard re-renders.
 *
 * RLS enforces that the row's customer_id matches `current_customer_id()`
 * — no application-side scope check needed beyond resolving customer_id
 * from the auth user.
 */

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function resolveCustomer(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; customerId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: customer, error } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) {
    return { ok: false, error: `Customer lookup failed: ${error.message}` };
  }
  if (!customer) {
    return { ok: false, error: "Customer profile not yet provisioned." };
  }
  return { ok: true, supabase, customerId: customer.id };
}

async function loadDisposition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerId: string,
  businessId: string,
): Promise<BusinessDisposition | null> {
  const { data } = await supabase
    .from("customer_business_disposition")
    .select("*")
    .eq("customer_id", customerId)
    .eq("business_id", businessId)
    .maybeSingle();
  return (data as BusinessDisposition) ?? null;
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Set or change the disposition status for a business. Optionally include
 * a lost_reason when status='lost'. Moving away from 'lost' clears the
 * stored reason.
 */
export async function setStatus(
  businessId: string,
  status: DispositionStatus,
  lostReason?: LostReason | null,
): Promise<ActionResult> {
  const ctx = await resolveCustomer();
  if (!ctx.ok) return ctx;
  const { supabase, customerId } = ctx;

  const existing = await loadDisposition(supabase, customerId, businessId);
  const fromStatus: DispositionStatus = existing?.status ?? "uncontacted";

  const payload: Record<string, unknown> = {
    customer_id: customerId,
    business_id: businessId,
    status,
  };
  if (status === "lost") {
    if (lostReason !== undefined) payload.lost_reason = lostReason;
  } else {
    payload.lost_reason = null;
  }

  const { error: upsertError } = await supabase
    .from("customer_business_disposition")
    .upsert(payload, { onConflict: "customer_id,business_id" });
  if (upsertError) {
    return { ok: false, error: `Status upsert failed: ${upsertError.message}` };
  }

  if (fromStatus !== status) {
    await supabase.from("customer_business_disposition_event").insert({
      customer_id: customerId,
      business_id: businessId,
      kind: "status_change",
      payload: { from: fromStatus, to: status },
    });
  }
  if (
    status === "lost" &&
    lostReason &&
    lostReason !== existing?.lost_reason
  ) {
    await supabase.from("customer_business_disposition_event").insert({
      customer_id: customerId,
      business_id: businessId,
      kind: "note",
      payload: { lost_reason: lostReason },
    });
  }

  revalidatePath("/");
  return { ok: true };
}

/**
 * Log a touch (call/email/meeting/note/other) against a specific license
 * event. Denormalizes business_id from classified_records at write time
 * so the activity timeline UNION query needs no join.
 *
 * Also advances customer_business_disposition.last_touched_at +
 * last_touch_kind — denormalized convenience so the dashboard list can
 * render "last touch" without a per-row MAX() subquery.
 */
export async function logTouch(
  classifiedRecordId: string,
  kind: TouchKind,
  detail?: string,
): Promise<ActionResult> {
  const ctx = await resolveCustomer();
  if (!ctx.ok) return ctx;
  const { supabase, customerId } = ctx;

  // Resolve business_id from the classified_records row. RLS on
  // classified_records gates this lookup to the customer's accessible
  // states; if the row isn't accessible the resolve returns null.
  const { data: record, error: recordError } = await supabase
    .from("classified_records")
    .select("id, business_id")
    .eq("id", classifiedRecordId)
    .maybeSingle();
  if (recordError) {
    return { ok: false, error: `Record lookup failed: ${recordError.message}` };
  }
  if (!record || !record.business_id) {
    return {
      ok: false,
      error: "Classified record not accessible or has no parent business.",
    };
  }

  const now = new Date().toISOString();

  // Append-only touch.
  const { error: touchError } = await supabase
    .from("customer_license_touch")
    .insert({
      customer_id: customerId,
      business_id: record.business_id,
      classified_record_id: classifiedRecordId,
      kind,
      payload: detail ? { detail } : {},
    });
  if (touchError) {
    return { ok: false, error: `Touch insert failed: ${touchError.message}` };
  }

  // Advance the disposition's last_touched_at (upsert handles
  // "no disposition row yet" by inserting status='saved' implicitly —
  // logging a touch on a business means the rep cares).
  await supabase
    .from("customer_business_disposition")
    .upsert(
      {
        customer_id: customerId,
        business_id: record.business_id,
        last_touched_at: now,
        last_touch_kind: kind,
      },
      { onConflict: "customer_id,business_id" },
    );

  revalidatePath("/");
  return { ok: true };
}

/**
 * Set or clear the follow-up timestamp on a business disposition. Writes
 * follow_up_set / follow_up_cleared event for the timeline.
 */
export async function setFollowUp(
  businessId: string,
  followUpAt: string | null,
): Promise<ActionResult> {
  const ctx = await resolveCustomer();
  if (!ctx.ok) return ctx;
  const { supabase, customerId } = ctx;

  const { error: upsertError } = await supabase
    .from("customer_business_disposition")
    .upsert(
      {
        customer_id: customerId,
        business_id: businessId,
        follow_up_at: followUpAt,
      },
      { onConflict: "customer_id,business_id" },
    );
  if (upsertError) {
    return { ok: false, error: `Follow-up upsert failed: ${upsertError.message}` };
  }

  await supabase.from("customer_business_disposition_event").insert({
    customer_id: customerId,
    business_id: businessId,
    kind: followUpAt ? "follow_up_set" : "follow_up_cleared",
    payload: followUpAt ? { at: followUpAt } : {},
  });

  revalidatePath("/");
  return { ok: true };
}

/**
 * Replace notes wholesale. Per Britt's 2026-05-28 decision: notes is a
 * scratchpad the rep edits; the event log already records that an edit
 * happened, so we get history without an append-only notes column.
 */
export async function updateNotes(
  businessId: string,
  notes: string,
): Promise<ActionResult> {
  const ctx = await resolveCustomer();
  if (!ctx.ok) return ctx;
  const { supabase, customerId } = ctx;

  const { error: upsertError } = await supabase
    .from("customer_business_disposition")
    .upsert(
      { customer_id: customerId, business_id: businessId, notes },
      { onConflict: "customer_id,business_id" },
    );
  if (upsertError) {
    return { ok: false, error: `Notes upsert failed: ${upsertError.message}` };
  }

  await supabase.from("customer_business_disposition_event").insert({
    customer_id: customerId,
    business_id: businessId,
    kind: "note",
    payload: { length: notes.length },
  });

  revalidatePath("/");
  return { ok: true };
}

/**
 * Upsert recently-viewed at business grain (one row per (customer,
 * business)). Re-opens advance last_viewed_at instead of duplicating.
 * Non-critical — never fails the caller's render.
 */
export async function logView(businessId: string): Promise<ActionResult> {
  const ctx = await resolveCustomer();
  if (!ctx.ok) return { ok: true }; // swallow — view-logging is non-critical
  const { supabase, customerId } = ctx;

  await supabase
    .from("customer_viewed_business")
    .upsert(
      {
        customer_id: customerId,
        business_id: businessId,
        last_viewed_at: new Date().toISOString(),
      },
      { onConflict: "customer_id,business_id" },
    );
  return { ok: true };
}

// ============================================================================
// Reads
// ============================================================================

export async function getDisposition(
  businessId: string,
): Promise<BusinessDisposition | null> {
  const ctx = await resolveCustomer();
  if (!ctx.ok) return null;
  return loadDisposition(ctx.supabase, ctx.customerId, businessId);
}

/**
 * Activity timeline at business grain. UNIONs the business_event +
 * license_touch tables, sorted DESC by created_at. The discriminator
 * `source` on each row tells the renderer which schema it follows.
 */
export async function getActivityTimeline(
  businessId: string,
  limit = 50,
): Promise<ActivityTimelineRow[]> {
  const ctx = await resolveCustomer();
  if (!ctx.ok) return [];
  const { supabase, customerId } = ctx;

  const [eventsRes, touchesRes] = await Promise.all([
    supabase
      .from("customer_business_disposition_event")
      .select("*")
      .eq("customer_id", customerId)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("customer_license_touch")
      .select("*")
      .eq("customer_id", customerId)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const events: ActivityTimelineRow[] = (eventsRes.data ?? []).map((e) => ({
    source: "business_event" as const,
    ...(e as Omit<ActivityTimelineRow & { source: "business_event" }, "source">),
  }));
  const touches: ActivityTimelineRow[] = (touchesRes.data ?? []).map((t) => ({
    source: "license_touch" as const,
    ...(t as Omit<ActivityTimelineRow & { source: "license_touch" }, "source">),
  }));

  return [...events, ...touches]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, limit);
}

/**
 * Recently-viewed strip. Business-grained: each row is a distinct prospect
 * the rep opened, ordered by most-recent. Display name resolves via
 * primary_dba_name with primary_legal_name fallback.
 */
export async function getRecentlyViewed(
  limit = 5,
): Promise<RecentlyViewedBusinessRow[]> {
  const ctx = await resolveCustomer();
  if (!ctx.ok) return [];
  const { supabase, customerId } = ctx;

  const { data } = await supabase
    .from("customer_viewed_business")
    .select(
      "business_id, last_viewed_at, businesses(primary_dba_name, primary_legal_name)",
    )
    .eq("customer_id", customerId)
    .order("last_viewed_at", { ascending: false })
    .limit(limit);

  // PostgREST returns embedded FK rows as an array of related rows (even
  // when the relationship is many-to-one). Cast through unknown and take
  // the first element.
  return ((data ?? []) as unknown as Array<{
    business_id: string;
    last_viewed_at: string;
    businesses:
      | Array<{
          primary_dba_name: string | null;
          primary_legal_name: string | null;
        }>
      | {
          primary_dba_name: string | null;
          primary_legal_name: string | null;
        }
      | null;
  }>).map((r) => {
    const b = Array.isArray(r.businesses) ? r.businesses[0] : r.businesses;
    return {
      business_id: r.business_id,
      display_name:
        b?.primary_dba_name ?? b?.primary_legal_name ?? "—",
      // signal_strength deferred to PR-2 (Code Agent A v2 lock).
      signal_strength: null,
      last_viewed_at: r.last_viewed_at,
    };
  });
}

/**
 * Status counts for the tab strip. Returns one number per status the rep
 * has explicitly dispositioned. Implicit "uncontacted" (no row) is
 * computed by the caller from `total_accessible - sum(explicit statuses)`.
 */
export async function getStatusCounts(): Promise<Record<DispositionStatus, number>> {
  const empty: Record<DispositionStatus, number> = {
    uncontacted: 0,
    saved: 0,
    working: 0,
    won: 0,
    lost: 0,
    skip: 0,
  };
  const ctx = await resolveCustomer();
  if (!ctx.ok) return empty;
  const { supabase, customerId } = ctx;

  const { data } = await supabase
    .from("customer_business_disposition")
    .select("status")
    .eq("customer_id", customerId);

  const counts = { ...empty };
  for (const r of (data ?? []) as Array<{ status: DispositionStatus }>) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  return counts;
}
