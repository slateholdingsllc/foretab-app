// NOTE: no "use server" directive. These functions are called from server
// components (Insights panel) — not as form-action Server Actions from
// client code — so the directive isn't required. AND under Next 15 a
// module marked "use server" can only export async functions; this file
// re-exports HOT_LIKE_SIGNALS / WARM_LIKE_SIGNALS arrays at the bottom,
// which would block the build.

import { createClient } from "@/lib/supabase/server";
import type {
  ActivityDay,
  DispositionFunnelData,
  SignalStrength,
  SignalWinRateRow,
} from "./types";

/**
 * Phase 3 CRM · Insights panel queries.
 *
 * --- DISTINCT-BUSINESS SEMANTICS ---
 * Every funnel stage + the win-rate-by-signal denominator counts DISTINCT
 * BUSINESSES, never disposition rows. A rep who has dispositioned five
 * Acme Liquor renewals contributes 1 to every stage, not 5 — matches
 * "businesses I'm working," not "events I touched." The pack's reference
 * implementation counted rows; we corrected this when adapting against
 * foretab-engine's per-event classified_records schema.
 *
 * --- STATE SCOPE ---
 * customer_accessible_state_ids() is called explicitly in the surfaced-cohort
 * filter rather than relying solely on classified_records RLS — defensive,
 * works whether or not classified_records RLS has been wired. If RLS later
 * double-filters, this is a no-op.
 *
 * --- SIGNAL VOCAB ---
 * Pinned to Agent A's v2 vocabulary (New/Established/Dormant) per the
 * 20260528000001_signal_strength_rename.sql migration. Verified 2026-05-29:
 * zero v1 rows remain in the live DB, so the transition arrays collapse to
 * the v2 literals.
 */

const HOT_LIKE_SIGNALS: readonly SignalStrength[] = ["New"];
const WARM_LIKE_SIGNALS: readonly SignalStrength[] = ["Established"];

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

// ===========================================================================
// Funnel: distinct-business counts at each stage
// ===========================================================================
//
// surfaced = distinct businesses in the customer's state scope (every
//            business they could disposition, dispositioned-or-not).
// saved    = distinct businesses with explicit disposition status in
//            {saved, working, won, lost} (Skip excluded — Skip is "hidden
//            from me," not part of the active funnel).
// engaged  = distinct businesses with last_touched_at IS NOT NULL.
// won      = distinct businesses with disposition status = 'won'.

export async function getDispositionFunnel(): Promise<DispositionFunnelData> {
  const empty: DispositionFunnelData = {
    surfaced: 0,
    saved: 0,
    engaged: 0,
    won: 0,
  };
  const ctx = await getAuthed();
  if (!ctx) return empty;
  const { supabase, customerId } = ctx;

  const { data: surfacedCount } = await supabase.rpc("get_surfaced_business_count");

  // The next three counts: customer_business_disposition has UNIQUE
  // (customer_id, business_id), so COUNT(*) on filtered rows IS the
  // distinct-business count. RLS scopes to own customer; explicit
  // customer_id filter is belt-and-suspenders.
  const [
    { count: savedCount },
    { count: engagedCount },
    { count: wonCount },
  ] = await Promise.all([
    supabase
      .from("customer_business_disposition")
      .select("*", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .in("status", ["saved", "working", "won", "lost"]),
    supabase
      .from("customer_business_disposition")
      .select("*", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .not("last_touched_at", "is", null),
    supabase
      .from("customer_business_disposition")
      .select("*", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("status", "won"),
  ]);

  return {
    surfaced: Number(surfacedCount ?? 0),
    saved: savedCount ?? 0,
    engaged: engagedCount ?? 0,
    won: wonCount ?? 0,
  };
}

// ===========================================================================
// Win rate by signal cohort
// ===========================================================================
//
// One row per signal value present in scope. total = distinct businesses
// that had at least one event of that signal in scope. won = subset of
// total that the rep has marked status='won'.
//
// Cohort overlap note: a single business can appear in multiple cohorts
// if its license events span different signals over time (e.g. Hot at
// new-issuance, then Established at renewal). This is intentional — the
// "where did the signal that surfaced this business come from" framing
// is more useful than forcing a primary-signal pick.

export async function getWinRateBySignal(): Promise<SignalWinRateRow[]> {
  const ctx = await getAuthed();
  if (!ctx) return [];
  const { supabase } = ctx;

  const { data: rows } = await supabase.rpc("get_win_rate_by_signal");

  return ((rows ?? []) as Array<{ signal: string; total: number; won: number }>).map(
    (r) => ({
      signal: r.signal as SignalStrength,
      total: Number(r.total),
      won: Number(r.won),
    }),
  );
}

// ===========================================================================
// Activity, last 30 days
// ===========================================================================
//
// Counts customer-side actions per day: status changes, note edits,
// follow-up sets/clears (business-event table) + calls, emails, meetings
// (license-touch table). Read both tables and aggregate client-side; the
// 30-day window keeps row volume small (rep activity is bounded by hand
// speed, not data size).

const TOUCH_KINDS_FOR_ACTIVITY = ["call", "email", "meeting"] as const;

export async function getActivityLast30Days(): Promise<ActivityDay[]> {
  const ctx = await getAuthed();
  if (!ctx) return [];
  const { supabase, customerId } = ctx;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);
  const sinceIso = thirtyDaysAgo.toISOString();

  const [eventsRes, touchesRes] = await Promise.all([
    supabase
      .from("customer_business_disposition_event")
      .select("created_at")
      .eq("customer_id", customerId)
      .gte("created_at", sinceIso),
    supabase
      .from("customer_license_touch")
      .select("created_at, kind")
      .eq("customer_id", customerId)
      .gte("created_at", sinceIso)
      .in("kind", TOUCH_KINDS_FOR_ACTIVITY as unknown as string[]),
  ]);

  // Build day buckets: 30 days, oldest first, all 0.
  const dayMap = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    dayMap.set(d.toISOString().slice(0, 10), 0);
  }

  for (const r of (eventsRes.data ?? []) as Array<{ created_at: string }>) {
    const key = r.created_at.slice(0, 10);
    if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
  }
  for (const r of (touchesRes.data ?? []) as Array<{ created_at: string }>) {
    const key = r.created_at.slice(0, 10);
    if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
  }

  return Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }));
}

// ===========================================================================
// Export the transition arrays so today.queries.ts + future callers reuse
// the same definitions. Both files will be pinned together when v2 is
// observable.
// ===========================================================================

export { HOT_LIKE_SIGNALS, WARM_LIKE_SIGNALS };
