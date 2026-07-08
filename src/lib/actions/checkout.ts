"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getStripe } from "@/lib/stripe/client";
import { getStripePriceId } from "@/lib/stripe/prices";
import type { BillingPeriod, Tier } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
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
    .select("id, email, billing_email, billing_email_verified_at, checkout_acknowledgment_at")
    .eq("auth_user_id", user.id)
    .single();
  if (customerError || !customer) {
    return { ok: false, error: "Customer profile not found." };
  }

  if (!customer.checkout_acknowledgment_at) {
    return { ok: false, error: "Please confirm the acknowledgment first." };
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
    .order("created_at", { ascending: false })
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
  });

  if (!session.url) {
    return { ok: false, error: "Stripe did not return a checkout URL." };
  }

  redirect(session.url);
}

/**
 * Record that the customer checked the pre-charge acknowledgment checkbox on
 * the plan page. Writes checkout_acknowledgment_at on customers — follows the
 * same R4 disclosure-timestamp pattern as excluded_state_acknowledgment_at.
 *
 * Root cause of prior silent-failure (2026-06-11): checkout_acknowledgment_at
 * is a legal-evidence column not in the authenticated role's UPDATE GRANT
 * (same intentional lock as the other disclosure columns — customers can't
 * self-modify evidence timestamps). Using the user-scoped client produces a
 * zero-rows-affected silent no-op. Fix: resolve the user via the user-scoped
 * client (session check), then write via the admin/service-role client that
 * bypasses the column-level grant. Same pattern as /auth/callback for the
 * OAuth disclosure timestamps.
 *
 * AGENT-B: customers table needs `checkout_acknowledgment_at timestamptz`
 * column if not already present. Same migration pattern as trial_cap_disclosure_at.
 */
export async function writeCheckoutAcknowledgment(): Promise<void> {
  console.log("[writeCheckoutAcknowledgment] action invoked");

  // Resolve the user via the session-aware client.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    console.error("[writeCheckoutAcknowledgment] no authenticated user — skipping write");
    return;
  }
  console.log("[writeCheckoutAcknowledgment] user resolved:", user.id);

  // Disclosure columns are excluded from the authenticated-role UPDATE GRANT;
  // use the service-role admin client to write (server action is server-only,
  // service key never reaches the browser).
  //
  // Wrapped in try-catch: createAdminClient() throws synchronously if
  // SUPABASE_SERVICE_ROLE_KEY is absent (e.g. misconfigured preview env).
  // Without the catch, the throw escapes the server action as a rejected
  // Promise that startTransition silently swallows — producing exactly the
  // same symptom as the prior user-scoped-client bug (no error, no write).
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error(
      "[writeCheckoutAcknowledgment] createAdminClient threw — SUPABASE_SERVICE_ROLE_KEY likely absent on this environment:",
      e instanceof Error ? e.message : String(e),
    );
    return;
  }

  const { error, count } = await admin
    .from("customers")
    .update({ checkout_acknowledgment_at: new Date().toISOString() }, { count: "exact" })
    .eq("auth_user_id", user.id);

  if (error) {
    console.error(
      "[writeCheckoutAcknowledgment] UPDATE failed:",
      JSON.stringify({ message: error.message, code: error.code, userId: user.id }),
    );
    return;
  }
  if (count === 0) {
    console.error(
      "[writeCheckoutAcknowledgment] UPDATE affected 0 rows — customer row missing or column not yet added (AGENT-B):",
      JSON.stringify({ userId: user.id }),
    );
    return;
  }
  console.log("[writeCheckoutAcknowledgment] timestamp written, rows affected:", count);
}

/**
 * Create a Stripe Customer Portal session for the current authenticated
 * customer (billing management — payment method, invoices, cancellation).
 * Per dispatch §7.5: use Stripe's hosted portal rather than building our
 * own.
 *
 * Used by /account Manage Billing button (Task 18). Errors redirect back
 * to /account?error=... so the form action stays Promise<void>-shaped for
 * React server-action compatibility.
 */
export async function createPortalSession(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!customer) {
    redirect("/account?error=Customer+profile+not+found.");
  }

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
    redirect("/account?error=No+subscription+yet+%E2%80%94+choose+a+plan+first.");
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
