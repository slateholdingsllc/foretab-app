import { NextResponse } from "next/server";
import { sendRenewalReminder } from "@/lib/email/renewal-reminder";
import type { BillingPeriod, Tier } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily cron: find annual subscriptions whose current_period_end is
 * 25-40 days out, dedup against subscription_renewal_reminders, send
 * one reminder email per (subscription, period_end, type), record
 * the send.
 *
 * Schedule lives in vercel.json. Vercel invokes this route once per
 * day via a GET request with `Authorization: Bearer ${CRON_SECRET}`.
 * Any other caller is rejected 401.
 *
 * Pre-Task-10 (Stripe checkout + webhooks not yet shipped): subscriptions
 * table is empty → cron finds 0 candidates → exits with sent:0,
 * candidates:0. No-op until first annual subscriber's renewal enters
 * the window. Path A per the Task 13 design discussion.
 */

const REMINDER_WINDOW_START_DAYS = 25;
const REMINDER_WINDOW_END_DAYS = 40;

export async function GET(request: Request) {
  // Vercel Cron auth: Authorization: Bearer ${CRON_SECRET}
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET env var not configured" },
      { status: 500 },
    );
  }
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const now = new Date();
  const windowStart = new Date(
    now.getTime() + REMINDER_WINDOW_START_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const windowEnd = new Date(
    now.getTime() + REMINDER_WINDOW_END_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Candidates: annual subscriptions whose current_period_end is in window.
  // We don't filter dedup here — we check per-row below to keep the query
  // simple. Inner-join customers to get email + billing_email.
  const { data: candidates, error: queryError } = await supabase
    .from("subscriptions")
    .select(
      `
      id,
      stripe_subscription_id,
      stripe_customer_id,
      tier,
      billing_period,
      status,
      current_period_end,
      customer:customers!inner ( id, email, billing_email )
    `,
    )
    .eq("status", "active")
    .eq("billing_period", "annual")
    .gte("current_period_end", windowStart)
    .lte("current_period_end", windowEnd);

  if (queryError) {
    console.error("[cron] Subscription query failed:", queryError);
    return NextResponse.json({ ok: false, error: queryError.message }, { status: 500 });
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      window_start: windowStart,
      window_end: windowEnd,
      candidates: 0,
      sent: 0,
      skipped: 0,
      errors: [],
    });
  }

  let sent = 0;
  let skipped = 0;
  const errors: Array<{ subscription_id: string; error: string }> = [];

  // PostgREST returns embedded relations as an array even for many-to-one
  // FKs. The subscriptions→customers FK is many-to-one, so customer[0]
  // is the single related row. Cast to unknown first to override TS's
  // inferred array shape for the embedded relation.
  for (const c of candidates as unknown as Array<{
    id: string;
    stripe_subscription_id: string;
    stripe_customer_id: string;
    tier: Tier;
    billing_period: BillingPeriod;
    current_period_end: string;
    customer: Array<{ id: string; email: string; billing_email: string | null }> | null;
  }>) {
    const customerRow = c.customer?.[0] ?? null;
    // Dedup: skip if we already sent a reminder for this (subscription, period_end, type)
    const { data: existing } = await supabase
      .from("subscription_renewal_reminders")
      .select("id")
      .eq("subscription_id", c.id)
      .eq("reminder_period_end", c.current_period_end)
      .eq("reminder_type", "annual_renewal")
      .maybeSingle();

    if (existing) {
      skipped += 1;
      continue;
    }

    const recipientEmail = customerRow?.billing_email ?? customerRow?.email;
    if (!recipientEmail) {
      errors.push({ subscription_id: c.id, error: "No recipient email on customer" });
      continue;
    }

    try {
      const result = await sendRenewalReminder({
        recipientEmail,
        tier: c.tier,
        billingPeriod: c.billing_period,
        renewalDate: c.current_period_end,
        stripeCustomerId: c.stripe_customer_id,
        stripeSubscriptionId: c.stripe_subscription_id,
      });

      const { error: insertError } = await supabase
        .from("subscription_renewal_reminders")
        .insert({
          subscription_id: c.id,
          reminder_period_end: c.current_period_end,
          reminder_type: "annual_renewal",
          recipient_email: recipientEmail,
          resend_message_id: result.id,
        });

      if (insertError) {
        // Email sent but dedup row failed to write — log and continue.
        // Next run will likely re-send (which violates dedup). Surface
        // loudly so operator can fix.
        console.error(
          `[cron] Email sent for subscription ${c.id} but dedup insert failed:`,
          insertError,
        );
        errors.push({
          subscription_id: c.id,
          error: `dedup insert failed: ${insertError.message}`,
        });
      }
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[cron] Failed to send for subscription ${c.id}:`, message);
      errors.push({ subscription_id: c.id, error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    window_start: windowStart,
    window_end: windowEnd,
    candidates: candidates.length,
    sent,
    skipped,
    errors,
  });
}
