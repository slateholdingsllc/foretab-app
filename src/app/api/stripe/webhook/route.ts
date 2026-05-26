import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  handleCheckoutSessionCompleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from "@/lib/stripe/handlers";
import { getStripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook receiver. Per dispatch §7.4 + Stripe's official
 * recommendations:
 *
 *   1. Verify the request was signed by Stripe (HMAC of the raw body)
 *   2. Insert the raw event into billing_events for audit/replay,
 *      keyed by stripe_event_id (UNIQUE so duplicate deliveries are
 *      first-line deduped here)
 *   3. Dispatch to the typed handler in src/lib/stripe/handlers.ts
 *   4. Return 200 quickly — Stripe times out at 30s
 *
 * Event types we currently handle (per dispatch §7.4):
 *   - checkout.session.completed
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 *   - invoice.paid
 *   - invoice.payment_failed
 *
 * Other events are still recorded in billing_events but unhandled. Adding
 * a new handler later doesn't require backfilling — we can replay from
 * the audit table.
 */

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET env var not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Read raw body — required for signature verification.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe webhook] signature verification failed:", message);
    return NextResponse.json({ error: `Invalid signature: ${message}` }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Audit: insert raw event. UNIQUE(stripe_event_id) prevents duplicate
  // processing — second delivery of same event returns 200 fast without
  // re-dispatching.
  const { error: insertError } = await supabase
    .from("billing_events")
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });

  if (insertError && insertError.code !== "23505") {
    // 23505 = unique_violation = duplicate event = expected on retry.
    // Any other error fails the request so Stripe retries.
    console.error("[stripe webhook] billing_events insert failed:", insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  if (insertError?.code === "23505") {
    // Duplicate delivery. Already processed (or in flight) — return 200
    // without re-dispatching.
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Dispatch.
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted({ event, supabase });
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated({ event, supabase });
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted({ event, supabase });
        break;
      case "invoice.paid":
        await handleInvoicePaid({ event, supabase });
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed({ event, supabase });
        break;
      default:
        // Logged in billing_events; no-op here.
        break;
    }

    // Mark processed.
    await supabase
      .from("billing_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("stripe_event_id", event.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stripe webhook] handler for ${event.type} failed:`, message);

    // Record the error in billing_events so replay can target failed ones.
    await supabase
      .from("billing_events")
      .update({ processing_error: message })
      .eq("stripe_event_id", event.id);

    // 500 → Stripe will retry. For some errors (programming bugs) retry
    // won't help; surface in logs.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
