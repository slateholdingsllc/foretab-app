"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getStripe } from "@/lib/stripe/client";
import { getStripePriceId } from "@/lib/stripe/prices";
import type { BillingPeriod, Tier } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";

const VALID_TIERS: Tier[] = ["single_state", "multi_state", "all_access"];
const VALID_PERIODS: BillingPeriod[] = ["monthly", "annual"];

export type CheckoutResult = { ok: true } | { ok: false; error: string };

/**
 * Create a Stripe Checkout Session for the current authenticated customer
 * and redirect them to Stripe's hosted page.
 *
 * Per dispatch §7.2 + §7.3:
 *   - Checkout collects payment only. State selection happens post-purchase
 *     in the dashboard (the multi-state expansion wizard ships in a
 *     follow-up; single_state and all_access don't need expansion).
 *   - We pass our internal customers.id in session.metadata so the
 *     webhook handler can resolve the right customer when
 *     checkout.session.completed arrives.
 *   - return_url + cancel_url use the request's origin so this works
 *     across preview deploys + production.
 */
export async function createCheckoutSession(formData: FormData): Promise<CheckoutResult> {
  const tierRaw = String(formData.get("tier") ?? "");
  const periodRaw = String(formData.get("billing_period") ?? "");

  if (!VALID_TIERS.includes(tierRaw as Tier)) {
    return { ok: false, error: `Invalid tier: ${tierRaw}` };
  }
  if (!VALID_PERIODS.includes(periodRaw as BillingPeriod)) {
    return { ok: false, error: `Invalid billing period: ${periodRaw}` };
  }
  const tier = tierRaw as Tier;
  const billingPeriod = periodRaw as BillingPeriod;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, email, billing_email, billing_email_verified_at")
    .eq("auth_user_id", user.id)
    .single();
  if (customerError || !customer) {
    return { ok: false, error: "Customer profile not found." };
  }

  const stripe = getStripe();

  // Resolve a Stripe Customer ID. We don't cache it on the customers row
  // (would need an extra migration); instead we check if any prior
  // subscription has one. First-time subscribers create a fresh Stripe
  // Customer; subsequent checkouts reuse via the subscription cache.
  // Orphan Stripe Customers (abandoned checkouts) are acceptable cost.
  const { data: priorSub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("customer_id", customer.id)
    .limit(1)
    .maybeSingle();

  let stripeCustomerId = priorSub?.stripe_customer_id ?? null;
  if (!stripeCustomerId) {
    const created = await stripe.customers.create({
      email:
        customer.billing_email_verified_at && customer.billing_email
          ? customer.billing_email
          : customer.email,
      metadata: { customer_id: customer.id },
    });
    stripeCustomerId = created.id;
  }

  const origin = await getRequestOrigin();
  const priceId = getStripePriceId(tier, billingPeriod);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { customer_id: customer.id, tier, billing_period: billingPeriod },
    subscription_data: {
      metadata: { customer_id: customer.id, tier, billing_period: billingPeriod },
    },
    success_url: `${origin}/?subscribed=${tier}`,
    cancel_url: `${origin}/trial-expired?cancelled=1`,
    automatic_tax: { enabled: true },
  });

  if (!session.url) {
    return { ok: false, error: "Stripe did not return a checkout URL." };
  }

  redirect(session.url);
}

/**
 * Create a Stripe Customer Portal session for the current authenticated
 * customer (billing management — payment method, invoices, cancellation).
 * Per dispatch §7.5: use Stripe's hosted portal rather than building our
 * own.
 *
 * Used by the future /account Manage Billing button (Task 18). Currently
 * only invoked manually.
 */
export async function createPortalSession(): Promise<CheckoutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!customer) return { ok: false, error: "Customer profile not found." };

  // Look up Stripe Customer ID from any existing subscription. No
  // customers.stripe_customer_id cache; subscriptions table is the
  // source of truth (denormalized from Stripe webhooks).
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("customer_id", customer.id)
    .limit(1)
    .maybeSingle();

  const stripeCustomerId = sub?.stripe_customer_id;
  if (!stripeCustomerId) {
    return { ok: false, error: "No active subscription — can't open billing portal." };
  }

  const stripe = getStripe();
  const origin = await getRequestOrigin();
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${origin}/account`,
  });
  redirect(session.url);
}

async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  if (!host) {
    return process.env.NEXT_PUBLIC_SITE_URL || "https://app.foretab.com";
  }
  const protocol = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
