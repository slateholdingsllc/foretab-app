"use server";

import { createClient } from "@/lib/supabase/server";
import { HOT_LIKE_SIGNALS, WARM_LIKE_SIGNALS } from "./insights.queries";
import { firstRow } from "@/lib/utils";
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

  const { data: signalRows } = await supabase.rpc("get_signals_for_businesses", {
    p_business_ids: businessIds,
  });

  const signalByBusiness = new Map<string, SignalStrength>();
  for (const r of (signalRows ?? []) as Array<{
    business_id: string;
    signal_strength: string;
  }>) {
    signalByBusiness.set(r.business_id, r.signal_strength as SignalStrength);
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
    const b = firstRow(r.businesses);
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
  const { supabase } = ctx;

  const { data: scopeRow } = await supabase.rpc(
    "customer_accessible_state_ids",
  );
  const accessibleStateIds: string[] = Array.isArray(scopeRow)
    ? (scopeRow as string[])
    : [];
  if (accessibleStateIds.length === 0) return [];

  // Route through get_feed — handles pagination, indexing, and disposition
  // filtering natively. The previous direct classified_records query with
  // order(created_at desc) + states() embed timed out on large 'New' row
  // counts (104K rows on 9-state accounts exceed the 8s PostgREST limit).
  // get_feed's p_disposition_status:"none" replaces the separate
  // customer_business_disposition filter query.
  type FeedRow = {
    business_id: string | null;
    state_id: string;
    signal_strength: string | null;
    classified_at: string;
    business_name: string | null;
    dba: string | null;
  };
  const { data: feedRows } = await supabase.rpc("get_feed", {
    p_state_ids:           accessibleStateIds,
    p_signal_strength:     [...HOT_LIKE_SIGNALS] as string[],
    p_days_window:         7,
    p_disposition_status:  "none",
    p_limit:               limit * 8,
    p_offset:              0,
    p_sort:                "newest",
    p_customer_status:     null,
    p_license_type:        null,
    p_license_record_type: null,
    p_business_archetype:  null,
    p_date_from:           null,
    p_new_this_week:       null,
    p_search:              null,
    p_city:                null,
    p_zip:                 null,
    p_icp_relevance:       null,
  });

  if (!feedRows || feedRows.length === 0) return [];

  // Dedup to one row per business (get_feed already orders newest first).
  const distinctByBusiness = new Map<string, FeedRow>();
  for (const raw of feedRows as FeedRow[]) {
    if (raw.business_id && !distinctByBusiness.has(raw.business_id)) {
      distinctByBusiness.set(raw.business_id, raw);
    }
  }
  const distinct = Array.from(distinctByBusiness.values()).slice(0, limit);

  // Resolve state_id → state_code for display (states table is tiny: 1 row/state).
  const stateIds = [...new Set(distinct.map((d) => d.state_id))];
  const { data: stateRows } = await supabase
    .from("states")
    .select("id, state_code")
    .in("id", stateIds);
  const stateCodeMap = new Map<string, string>(
    ((stateRows ?? []) as Array<{ id: string; state_code: string | null }>)
      .filter((r) => r.state_code)
      .map((r) => [r.id, r.state_code!]),
  );

  return distinct.map((c) => ({
    business_id: c.business_id!,
    display_name: c.dba ?? c.business_name ?? "—",
    state_code: stateCodeMap.get(c.state_id) ?? null,
    signal_strength: (c.signal_strength ?? "New") as SignalStrength,
    surfaced_at: c.classified_at,
  }));
}
