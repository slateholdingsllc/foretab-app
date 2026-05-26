import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupTierFromPriceId } from "./prices";

/**
 * Stripe webhook event handlers. Called from /api/stripe/webhook/route.ts
 * after signature verification + billing_events audit insert.
 *
 * Idempotency: each handler is safe to call multiple times for the same
 * event. Stripe retries failed webhooks, so we may see the same event
 * id twice. The billing_events table has UNIQUE(stripe_event_id) which
 * the webhook route uses for first-line dedup; this layer also uses
 * UPSERT patterns so re-runs are no-ops.
 *
 * Operates with a service-role Supabase client (the webhook is a server
 * route with no user session). RLS is bypassed.
 */

type HandlerArgs = {
  event: Stripe.Event;
  supabase: SupabaseClient;
};

export async function handleCheckoutSessionCompleted(args: HandlerArgs): Promise<void> {
  const session = args.event.data.object as Stripe.Checkout.Session;
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;
  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!stripeCustomerId || !stripeSubscriptionId) {
    console.error("[stripe webhook] checkout.session.completed missing customer or subscription:", {
      sessionId: session.id,
      customer: session.customer,
      subscription: session.subscription,
    });
    return;
  }

  // Map session metadata (we set this when creating the Checkout Session)
  // back to our customer row. session.metadata.customer_id is our internal
  // customers.id (NOT Stripe's customer ID).
  const customerId = session.metadata?.customer_id;
  if (!customerId) {
    console.error("[stripe webhook] checkout.session.completed missing metadata.customer_id:", {
      sessionId: session.id,
    });
    return;
  }

  // Look up the price purchased — Checkout sessions don't have a direct
  // price field; we have to fetch the subscription's first item.
  // session.line_items isn't auto-expanded; subscribe to the
  // subscription instead.
  const subscriptionResponse = await fetchSubscription(stripeSubscriptionId);
  const firstItem = subscriptionResponse.items?.data?.[0];
  const priceId = firstItem?.price?.id;
  if (!priceId) {
    console.error("[stripe webhook] could not resolve price from subscription:", {
      sessionId: session.id,
      subscriptionId: stripeSubscriptionId,
    });
    return;
  }

  const tierMap = lookupTierFromPriceId(priceId);
  if (!tierMap) {
    console.error("[stripe webhook] price ID not in our config:", { priceId });
    return;
  }

  // In Stripe API 2026-04-22 (dahlia), current_period_start/end moved
  // from the subscription to per-item billing periods (subscriptions
  // can have items on different schedules). We use single-item
  // subscriptions, so item[0]'s period applies.
  const periodStart = firstItem?.current_period_start;
  const periodEnd = firstItem?.current_period_end;

  // UPSERT the subscriptions row.
  const { error: subError } = await args.supabase.from("subscriptions").upsert(
    {
      customer_id: customerId,
      stripe_subscription_id: stripeSubscriptionId,
      stripe_customer_id: stripeCustomerId,
      tier: tierMap.tier,
      billing_period: tierMap.billingPeriod,
      status: subscriptionResponse.status,
      current_period_start: periodStart
        ? new Date(periodStart * 1000).toISOString()
        : null,
      current_period_end: periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : null,
      cancel_at_period_end: subscriptionResponse.cancel_at_period_end ?? false,
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (subError) {
    console.error("[stripe webhook] subscriptions upsert failed:", subError);
    throw subError;
  }

  // Update customers: stripe_customer_id, status, current_tier.
  const { error: custError } = await args.supabase
    .from("customers")
    .update({
      status: "active",
      current_tier: tierMap.tier,
    })
    .eq("id", customerId);
  if (custError) {
    console.error("[stripe webhook] customers update failed:", custError);
    throw custError;
  }

  // Mark the trial as converted (if one exists).
  const { data: trial } = await args.supabase
    .from("trials")
    .select("id")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (trial) {
    const { data: createdSub } = await args.supabase
      .from("subscriptions")
      .select("id")
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .maybeSingle();
    if (createdSub) {
      await args.supabase
        .from("trials")
        .update({
          status: "converted",
          converted_at: new Date().toISOString(),
          converted_to_subscription_id: createdSub.id,
        })
        .eq("id", trial.id);
    }
  }

  // For all_access, expand customer_states to every sellable state.
  // For single_state and multi_state, the customer keeps their trial
  // state; multi_state state expansion to 5 happens in a future PR
  // (post-checkout multi-state picker — Task 18 territory).
  if (tierMap.tier === "all_access") {
    const { data: createdSub } = await args.supabase
      .from("subscriptions")
      .select("id")
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .maybeSingle();
    if (createdSub) {
      await expandCustomerStatesToAllAccess({
        supabase: args.supabase,
        customerId,
        subscriptionId: createdSub.id,
      });
    }
  }
}

export async function handleSubscriptionUpdated(args: HandlerArgs): Promise<void> {
  const sub = args.event.data.object as Stripe.Subscription;

  const firstItem = sub.items?.data?.[0];
  const priceId = firstItem?.price?.id;
  const tierMap = priceId ? lookupTierFromPriceId(priceId) : null;

  // current_period_start/end moved to per-item in Stripe API 2026-04-22.
  // Single-item subscriptions → item[0]'s period applies.
  const periodStart = firstItem?.current_period_start;
  const periodEnd = firstItem?.current_period_end;

  const update: Record<string, unknown> = {
    status: sub.status,
    current_period_start: periodStart
      ? new Date(periodStart * 1000).toISOString()
      : null,
    current_period_end: periodEnd
      ? new Date(periodEnd * 1000).toISOString()
      : null,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
  };
  if (tierMap) {
    update.tier = tierMap.tier;
    update.billing_period = tierMap.billingPeriod;
  }

  const { error } = await args.supabase
    .from("subscriptions")
    .update(update)
    .eq("stripe_subscription_id", sub.id);
  if (error) {
    console.error("[stripe webhook] subscription update failed:", error);
    throw error;
  }

  // If tier changed, sync customers.current_tier.
  if (tierMap) {
    const { data: row } = await args.supabase
      .from("subscriptions")
      .select("customer_id")
      .eq("stripe_subscription_id", sub.id)
      .maybeSingle();
    if (row?.customer_id) {
      await args.supabase
        .from("customers")
        .update({ current_tier: tierMap.tier })
        .eq("id", row.customer_id);
    }
  }
}

export async function handleSubscriptionDeleted(args: HandlerArgs): Promise<void> {
  const sub = args.event.data.object as Stripe.Subscription;

  await args.supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      canceled_at: sub.canceled_at
        ? new Date(sub.canceled_at * 1000).toISOString()
        : new Date().toISOString(),
    })
    .eq("stripe_subscription_id", sub.id);

  // Mark customer as cancelled. Their access continues until current_period_end
  // via the customer_accessible_state_ids() helper which checks subscription
  // status='active'.
  const { data: row } = await args.supabase
    .from("subscriptions")
    .select("customer_id")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  if (row?.customer_id) {
    await args.supabase
      .from("customers")
      .update({ status: "cancelled" })
      .eq("id", row.customer_id);
  }
}

export async function handleInvoicePaid(args: HandlerArgs): Promise<void> {
  // Successful recurring billing. subscription.updated will sync the
  // new current_period_end; nothing else to do here. Log only.
  const invoice = args.event.data.object as Stripe.Invoice;
  console.log("[stripe webhook] invoice.paid:", {
    invoiceId: invoice.id,
    subscriptionId: extractSubscriptionId(invoice),
    amount_paid: invoice.amount_paid,
  });
}

export async function handleInvoicePaymentFailed(args: HandlerArgs): Promise<void> {
  const invoice = args.event.data.object as Stripe.Invoice;
  const subscriptionId = extractSubscriptionId(invoice);
  if (!subscriptionId) return;

  // Mark customer as past_due. The customer_accessible_state_ids() helper
  // checks customer.status IN ('trial', 'active'); past_due means access
  // cuts off after the current billing period. Stripe handles dunning
  // (retry attempts); we just reflect the state.
  const { data: row } = await args.supabase
    .from("subscriptions")
    .select("customer_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (row?.customer_id) {
    await args.supabase
      .from("customers")
      .update({ status: "past_due" })
      .eq("id", row.customer_id);
  }
}

// =========================================================================
// Helpers
// =========================================================================

/**
 * Fetch the latest subscription object from Stripe. Used by
 * handleCheckoutSessionCompleted to resolve price + period info that
 * isn't on the Checkout Session itself.
 */
async function fetchSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  const { getStripe } = await import("./client");
  return getStripe().subscriptions.retrieve(subscriptionId);
}

/**
 * Extract subscription ID from an Invoice. In Stripe API 2026-04-22
 * (dahlia), invoice.subscription moved to invoice.parent.subscription_details.subscription.
 * Returns null if the invoice isn't for a subscription (e.g., one-off).
 */
function extractSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent;
  if (!parent || parent.type !== "subscription_details") return null;
  const sub = parent.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

/**
 * Expand customer_states to every sellable state for an all_access
 * subscription. Idempotent — ON CONFLICT DO NOTHING on the unique
 * (customer_id, state_id).
 */
async function expandCustomerStatesToAllAccess(args: {
  supabase: SupabaseClient;
  customerId: string;
  subscriptionId: string;
}): Promise<void> {
  const { data: states } = await args.supabase
    .from("states_active_for_sale")
    .select("id");
  if (!states || states.length === 0) return;

  const rows = states.map((s: { id: string }) => ({
    customer_id: args.customerId,
    state_id: s.id,
    granted_via: "subscription",
    subscription_id: args.subscriptionId,
  }));

  // Use upsert with onConflict to ignore duplicates (existing state grants
  // from the trial, etc.)
  await args.supabase.from("customer_states").upsert(rows, {
    onConflict: "customer_id,state_id",
    ignoreDuplicates: true,
  });
}
