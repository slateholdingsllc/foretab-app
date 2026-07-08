import { NextResponse } from "next/server";
import { sendRenewalReminder } from "@/lib/email/renewal-reminder";
import type { BillingPeriod, Tier } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { firstRow } from "@/lib/utils";

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
  // Inner-join customers to get email + billing_email.
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
    console.error("[cron/renewal] Subscription query failed:", queryError);
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

  for (const c of candidates as unknown as Array<{
    id: string;
    stripe_subscription_id: string;
    stripe_customer_id: string;
    tier: Tier;
    billing_period: BillingPeriod;
    current_period_end: string;
    customer:
      | Array<{ id: string; email: string; billing_email: string | null }>
      | { id: string; email: string; billing_email: string | null }
      | null;
  }>) {
    const customerRow = firstRow(c.customer);

    const recipientEmail = customerRow?.billing_email ?? customerRow?.email;
    if (!recipientEmail) {
      errors.push({ subscription_id: c.id, error: "No recipient email on customer" });
      continue;
    }

    // C9: insert dedup row BEFORE sending. If the insert fails with a
    // unique-constraint violation (23505) the email was already sent this
    // cycle — skip. If we crash after inserting but before sending the
    // email, the next run skips safely. If the send itself fails we DELETE
    // the row so the next run can retry. Preferred failure mode is a missed
    // email (recoverable) not a duplicate legal notice.
    const { error: insertError } = await supabase
      .from("subscription_renewal_reminders")
      .insert({
        subscription_id: c.id,
        reminder_period_end: c.current_period_end,
        reminder_type: "annual_renewal",
        recipient_email: recipientEmail,
        resend_message_id: "pending",
      });

    if (insertError) {
      if (insertError.code === "23505") {
        skipped += 1;
        continue;
      }
      console.error(`[cron/renewal] Dedup insert failed for ${c.id}:`, insertError);
      errors.push({ subscription_id: c.id, error: `dedup insert: ${insertError.message}` });
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

      // Update the pending sentinel with the real Resend message ID.
      await supabase
        .from("subscription_renewal_reminders")
        .update({ resend_message_id: result.id })
        .eq("subscription_id", c.id)
        .eq("reminder_period_end", c.current_period_end)
        .eq("reminder_type", "annual_renewal");

      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[cron/renewal] Send failed for subscription ${c.id}:`, message);
      // Remove the dedup row so the next cron run retries.
      await supabase
        .from("subscription_renewal_reminders")
        .delete()
        .eq("subscription_id", c.id)
        .eq("reminder_period_end", c.current_period_end)
        .eq("reminder_type", "annual_renewal");
      errors.push({ subscription_id: c.id, error: message });
    }
  }

  if (errors.length > 0 && errors.length === candidates.length) {
    console.error(
      `[cron/renewal] ALL ${candidates.length} candidates failed — check Resend and DB health`,
    );
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
