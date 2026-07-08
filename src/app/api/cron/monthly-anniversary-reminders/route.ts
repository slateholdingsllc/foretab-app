import { NextResponse } from "next/server";
import { sendRenewalReminder } from "@/lib/email/renewal-reminder";
import type { BillingPeriod, Tier } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { firstRow } from "@/lib/utils";

/**
 * CO SB25-145 / Terms § 8 — Monthly subscriber anniversary reminder.
 *
 * Fires daily. Finds active monthly subscriptions whose enrollment
 * anniversary (1-year, 2-year, …) falls 25–40 days from today, dedupes
 * against subscription_renewal_reminders, sends one email per
 * (subscription, anniversary_date) cycle, records the send.
 *
 * Trigger mechanism: daily cron (vercel.json, same schedule as the
 * existing annual-renewal cron). Stripe doesn't emit a "crossing a
 * year anniversary" webhook, so cron is the only viable trigger — no
 * Stripe-side plumbing needed and the daily cadence matches the
 * existing annual-reminder pattern.
 *
 * Test mode: ?test=1&subscription_id=<uuid> bypasses the anniversary
 * window check and fires for the named subscription unconditionally
 * (no dedup write). Returns the email that would be sent without
 * inserting a reminder row. Requires the same CRON_SECRET header.
 *
 * State scope: ALL monthly subscribers, regardless of business_state.
 * Over-comply per counsel R4 dispatch — no state-detection logic.
 *
 * Schedule lives in vercel.json alongside the annual-renewal cron.
 */

const REMINDER_WINDOW_START_DAYS = 25;
const REMINDER_WINDOW_END_DAYS = 40;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_YEAR = 365.25 * MS_PER_DAY;

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const testMode = url.searchParams.get("test") === "1";
  const testSubscriptionId = url.searchParams.get("subscription_id");

  if (testMode && !testSubscriptionId) {
    return NextResponse.json(
      { ok: false, error: "test mode requires subscription_id param" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const now = new Date();

  // Fetch all active monthly subscriptions (or just the test target).
  const query = supabase
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
      created_at,
      customer:customers!inner ( id, email, billing_email )
    `,
    )
    .eq("status", "active")
    .eq("billing_period", "monthly");

  if (testMode && testSubscriptionId) {
    query.eq("id", testSubscriptionId);
  }

  const { data: candidates, error: queryError } = await query;

  if (queryError) {
    console.error("[cron/monthly-anniversary] Query failed:", queryError);
    return NextResponse.json({ ok: false, error: queryError.message }, { status: 500 });
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      test_mode: testMode,
      candidates_checked: 0,
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
    status: string;
    current_period_end: string;
    created_at: string;
    customer:
      | Array<{ id: string; email: string; billing_email: string | null }>
      | { id: string; email: string; billing_email: string | null }
      | null;
  }>) {
    const customerRow = firstRow(c.customer);
    const enrolledAt = new Date(c.created_at);

    // Find which anniversary year (if any) falls in the reminder window today.
    // anniversaryDate = enrolledAt + n years. We check n = 1, 2, … up to 20.
    let anniversaryDate: Date | null = null;
    if (!testMode) {
      for (let n = 1; n <= 20; n++) {
        const candidate = new Date(enrolledAt.getTime() + n * MS_PER_YEAR);
        const daysUntil = (candidate.getTime() - now.getTime()) / MS_PER_DAY;
        if (
          daysUntil >= REMINDER_WINDOW_START_DAYS &&
          daysUntil <= REMINDER_WINDOW_END_DAYS
        ) {
          anniversaryDate = candidate;
          break;
        }
      }
      if (!anniversaryDate) {
        skipped += 1;
        continue;
      }
    } else {
      // Test mode: use the next monthly renewal as the "anniversary date"
      // so the email content is realistic without waiting a year.
      anniversaryDate = new Date(c.current_period_end);
    }

    const anniversaryIso = anniversaryDate.toISOString();

    const recipientEmail = customerRow?.billing_email ?? customerRow?.email;
    if (!recipientEmail) {
      errors.push({ subscription_id: c.id, error: "No recipient email on customer" });
      continue;
    }

    if (testMode) {
      // Test mode: send without writing a dedup row.
      try {
        await sendRenewalReminder({
          recipientEmail,
          tier: c.tier,
          billingPeriod: c.billing_period,
          renewalDate: c.current_period_end,
          stripeCustomerId: c.stripe_customer_id,
          stripeSubscriptionId: c.stripe_subscription_id,
        });
        sent += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ subscription_id: c.id, error: message });
      }
      continue;
    }

    // C9: insert dedup row BEFORE sending. On unique-constraint violation
    // (23505) this cycle was already handled — skip. On send failure we
    // DELETE the row so the next run retries. Preferred failure mode is a
    // missed email (recoverable) not a duplicate legal notice.
    const { error: insertError } = await supabase
      .from("subscription_renewal_reminders")
      .insert({
        subscription_id: c.id,
        reminder_period_end: anniversaryIso,
        reminder_type: "monthly_anniversary",
        recipient_email: recipientEmail,
        resend_message_id: "pending",
      });

    if (insertError) {
      if (insertError.code === "23505") {
        skipped += 1;
        continue;
      }
      console.error(
        `[cron/monthly-anniversary] Dedup insert failed for ${c.id}:`,
        insertError,
      );
      errors.push({
        subscription_id: c.id,
        error: `dedup insert: ${insertError.message}`,
      });
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
        .eq("reminder_period_end", anniversaryIso)
        .eq("reminder_type", "monthly_anniversary");

      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[cron/monthly-anniversary] Failed for subscription ${c.id}:`, message);
      // Remove the dedup row so the next cron run retries.
      await supabase
        .from("subscription_renewal_reminders")
        .delete()
        .eq("subscription_id", c.id)
        .eq("reminder_period_end", anniversaryIso)
        .eq("reminder_type", "monthly_anniversary");
      errors.push({ subscription_id: c.id, error: message });
    }
  }

  if (errors.length > 0 && errors.length === candidates.length) {
    console.error(
      `[cron/monthly-anniversary] ALL ${candidates.length} candidates failed — check Resend and DB health`,
    );
  }

  return NextResponse.json({
    ok: true,
    test_mode: testMode,
    candidates_checked: candidates.length,
    sent,
    skipped,
    errors,
  });
}
