"use server";

import { createClient } from "@/lib/supabase/server";
import { HOT_LIKE_SIGNALS, WARM_LIKE_SIGNALS } from "./insights.queries";
import type {
  DueFollowUp,
  NewHighPriorityLead,
  SignalStrength,
} from "./types";

/**
 * Phase 3 CRM · Today panel queries.
 *
 * --- PR-2 STATUS ---
 * See insights.queries.ts header for the v2 enum cutover sequence —
 * HOT_LIKE_SIGNALS / WARM_LIKE_SIGNALS are imported from there so both
 * files pin together when Code Agent A's migration locks.
 *
 * --- TODAY PANEL CONTRACT ---
 * Two columns, both bounded to a small N:
 *   Due follow-ups       follow_up_at <= now() on the rep's own dispositions
 *   New high-priority    classified_records with high-signal (Hot/New +
 *                        Warm/Established) in the last 7 days that the rep
 *                        hasn't yet dispositioned (or has explicitly
 *                        un-dispositioned to uncontacted)
 *
 * Both columns surface BUSINESSES, not classified_record events — same
 * "rep works the prospect, not the paperwork" framing as Recently Viewed.
 */

async function getAuthed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!customer) return null;
  return { supabase, customerId: customer.id };
}

function resolveDisplayName(b: {
  primary_dba_name: string | null;
  primary_legal_name: string | null;
} | null): string {
  return b?.primary_dba_name ?? b?.primary_legal_name ?? "—";
}

// ===========================================================================
// Due follow-ups for today
// ===========================================================================
//
// Disposition rows where follow_up_at has passed. Returns ordered by
// follow_up_at ASC (oldest-overdue first). For the signal badge we pick a
// representative signal from the business's most recent classified_record
// in scope — done via a separate per-business lookup rather than a
// PostgREST embedded select, because the embed shape across two FK hops
// (disposition -> business -> classified_records) is brittle.

export async function getDueFollowUpsForToday(
  limit = 5,
): Promise<DueFollowUp[]> {
  const ctx = await getAuthed();
  if (!ctx) return [];
  const { supabase, customerId } = ctx;

  const nowIso = new Date().toISOString();
  const { data: dueRows, error: dueError } = await supabase
    .from("customer_business_disposition")
    .select(
      "id, business_id, follow_up_at, businesses(primary_dba_name, primary_legal_name)",
    )
    .eq("customer_id", customerId)
    .lte("follow_up_at", nowIso)
    .order("follow_up_at", { ascending: true })
    .limit(limit);

  if (dueError || !dueRows || dueRows.length === 0) return [];

  // Per-business representative signal lookup — most recent
  // classified_record's signal_strength.
  const businessIds = dueRows.map((r) => (r as { business_id: string }).business_id);

  const { data: signalRows } = await supabase
    .from("classified_records")
    .select("business_id, signal_strength, created_at")
    .in("business_id", businessIds)
    .not("signal_strength", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit * 20);

  const signalByBusiness = new Map<string, SignalStrength>();
  for (const r of (signalRows ?? []) as Array<{
    business_id: string;
    signal_strength: string;
  }>) {
    if (!signalByBusiness.has(r.business_id)) {
      signalByBusiness.set(r.business_id, r.signal_strength as SignalStrength);
    }
  }

  return (dueRows as unknown as Array<{
    id: string;
    business_id: string;
    follow_up_at: string;
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
      disposition_id: r.id,
      business_id: r.business_id,
      follow_up_at: r.follow_up_at,
      display_name: resolveDisplayName(b),
      signal_strength: signalByBusiness.get(r.business_id) ?? null,
    };
  });
}

// ===========================================================================
// New high-priority leads (last 7 days, not yet dispositioned)
// ===========================================================================
//
// Distinct businesses with at least one Hot/New OR Warm/Established
// classified_record in the last 7 days, scoped to the customer's
// accessible states, that the rep has either no disposition row for OR
// has explicitly status='uncontacted' (rare — uncontacted is usually the
// implicit no-row state, but explicit rows can exist if a user clicks the
// status back).
//
// "High-priority" v1 was Hot + Warm; v2's equivalent is New + Established.
// Until v2 backfill state is confirmed, both vocabularies match via the
// shared HOT_LIKE_SIGNALS + WARM_LIKE_SIGNALS arrays.

export async function getNewHighPriority(
  limit = 5,
): Promise<NewHighPriorityLead[]> {
  const ctx = await getAuthed();
  if (!ctx) return [];
  const { supabase, customerId } = ctx;

  const { data: scopeRow } = await supabase.rpc(
    "customer_accessible_state_ids",
  );
  const accessibleStateIds: string[] = Array.isArray(scopeRow)
    ? (scopeRow as string[])
    : [];
  if (accessibleStateIds.length === 0) return [];

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sinceIso = sevenDaysAgo.toISOString();

  // Panel header is "New · high priority" — filter to New signal only.
  // WARM_LIKE_SIGNALS (Established) was included during v1→v2 vocabulary
  // migration; now that v2 is confirmed, Established records belong to a
  // separate "warm pipeline" surface, not the high-priority inbox.
  const highPrioritySignals = HOT_LIKE_SIGNALS;

  // Pull the qualifying classified_records in the last 7 days. Overfetch
  // a bit so we can dedup to distinct businesses + still return `limit`
  // after filtering against the customer's existing dispositions.
  const { data: candidateRows } = await supabase
    .from("classified_records")
    .select(
      "business_id, state_id, signal_strength, created_at, businesses(primary_dba_name, primary_legal_name, primary_state_code)",
    )
    .in("state_id", accessibleStateIds)
    .in("signal_strength", highPrioritySignals as unknown as string[])
    .gte("created_at", sinceIso)
    .not("business_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit * 8);

  if (!candidateRows || candidateRows.length === 0) return [];

  // Dedup to one row per business: keep the most recent qualifying event.
  type Candidate = {
    business_id: string;
    state_id: string;
    signal_strength: string;
    created_at: string;
    businesses:
      | Array<{
          primary_dba_name: string | null;
          primary_legal_name: string | null;
          primary_state_code: string | null;
        }>
      | {
          primary_dba_name: string | null;
          primary_legal_name: string | null;
          primary_state_code: string | null;
        }
      | null;
  };
  const distinctByBusiness = new Map<string, Candidate>();
  for (const raw of candidateRows as unknown as Candidate[]) {
    if (!distinctByBusiness.has(raw.business_id)) {
      distinctByBusiness.set(raw.business_id, raw);
    }
  }
  const distinct = Array.from(distinctByBusiness.values());

  // Filter out businesses the rep has already dispositioned (any status
  // other than uncontacted — uncontacted only exists explicitly when a
  // rep reset the status; the implicit no-row case is what we WANT to
  // surface as "new high priority").
  const businessIds = distinct.map((d) => d.business_id);
  const { data: existingRows } = await supabase
    .from("customer_business_disposition")
    .select("business_id, status")
    .eq("customer_id", customerId)
    .in("business_id", businessIds);

  const dispositionedSet = new Set<string>();
  for (const r of (existingRows ?? []) as Array<{
    business_id: string;
    status: string;
  }>) {
    if (r.status !== "uncontacted") dispositionedSet.add(r.business_id);
  }

  const fresh = distinct.filter((d) => !dispositionedSet.has(d.business_id));

  // Resolve display fields + project to NewHighPriorityLead shape.
  return fresh.slice(0, limit).map((c) => {
    const b = Array.isArray(c.businesses) ? c.businesses[0] : c.businesses;
    return {
      business_id: c.business_id,
      display_name: resolveDisplayName(b),
      state_code: b?.primary_state_code ?? null,
      signal_strength: c.signal_strength as SignalStrength,
      surfaced_at: c.created_at,
    };
  });
}
