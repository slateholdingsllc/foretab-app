import { NextResponse } from "next/server";
import { sendTrialExpiryReminder } from "@/lib/email/trial-expiry-reminder";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily cron: find active trials expiring in the next 20-44 hours,
 * dedup against trial_expiry_reminders, send one "expires tomorrow"
 * email per trial, record the send.
 *
 * Window of 20-44h: cron fires at 14:00 UTC daily. A trial started at
 * any time of day will have its expires_at fall into this window exactly
 * once — on the day before expiry. Dedup on trial_id (unique constraint)
 * prevents a second send if the cron fires twice or the window shifts.
 *
 * Schedule: vercel.json — same 14:00 UTC slot as subscription-renewal-reminders.
 * Auth: Vercel passes Authorization: Bearer ${CRON_SECRET}.
 */

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

  const supabase = createAdminClient();

  // Trials expiring in the 20-44h window from now ("expires tomorrow").
  const windowStart = new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString();
  const windowEnd   = new Date(Date.now() + 44 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error: queryError } = await supabase
    .from("trials")
    .select(`
      id,
      expires_at,
      state:states!inner ( state_code ),
      customer:customers!inner ( id, email, billing_email )
    `)
    .eq("status", "active")
    .gte("expires_at", windowStart)
    .lte("expires_at", windowEnd);

  if (queryError) {
    console.error("[cron] trial-expiry-reminder query failed:", queryError);
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
  const errors: Array<{ trial_id: string; error: string }> = [];

  // PostgREST returns embedded many-to-one relations as arrays; index [0].
  for (const c of candidates as unknown as Array<{
    id: string;
    expires_at: string;
    state: Array<{ state_code: string }> | null;
    customer: Array<{ id: string; email: string; billing_email: string | null }> | null;
  }>) {
    const stateRow    = c.state?.[0] ?? null;
    const customerRow = c.customer?.[0] ?? null;

    // Dedup: skip if already sent for this trial
    const { data: existing } = await supabase
      .from("trial_expiry_reminders")
      .select("id")
      .eq("trial_id", c.id)
      .maybeSingle();

    if (existing) {
      skipped += 1;
      continue;
    }

    const recipientEmail = customerRow?.billing_email ?? customerRow?.email;
    if (!recipientEmail) {
      errors.push({ trial_id: c.id, error: "No recipient email on customer" });
      continue;
    }
    if (!stateRow?.state_code) {
      errors.push({ trial_id: c.id, error: "No state_code on trial" });
      continue;
    }

    try {
      const result = await sendTrialExpiryReminder({
        recipientEmail,
        stateCode: stateRow.state_code,
        expiresAt: c.expires_at,
      });

      const { error: insertError } = await supabase
        .from("trial_expiry_reminders")
        .insert({
          trial_id: c.id,
          recipient_email: recipientEmail,
          resend_message_id: result.id,
        });

      if (insertError) {
        // Email sent but dedup row failed — next run will re-send. Surface loudly.
        console.error(
          `[cron] Email sent for trial ${c.id} but dedup insert failed:`,
          insertError,
        );
        errors.push({ trial_id: c.id, error: `dedup insert failed: ${insertError.message}` });
      }
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[cron] Failed to send for trial ${c.id}:`, message);
      errors.push({ trial_id: c.id, error: message });
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
