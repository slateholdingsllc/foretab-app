import type { BillingPeriod, Tier } from "@/lib/pricing";

/**
 * Mapping from (tier, billing_period) → Stripe Price ID. Loaded from env
 * vars so price IDs can rotate without code changes.
 *
 * Env var convention: STRIPE_PRICE_<TIER>_<PERIOD>, e.g.:
 *   STRIPE_PRICE_SINGLE_STATE_MONTHLY=price_xxx
 *   STRIPE_PRICE_SINGLE_STATE_ANNUAL=price_xxx
 *   STRIPE_PRICE_MULTI_STATE_MONTHLY=price_xxx
 *   STRIPE_PRICE_MULTI_STATE_ANNUAL=price_xxx
 *   STRIPE_PRICE_ALL_ACCESS_MONTHLY=price_xxx
 *   STRIPE_PRICE_ALL_ACCESS_ANNUAL=price_xxx
 *
 * Six total. Britt sets these in Vercel after grabbing the price IDs
 * from Cowork's Stripe configuration (see foretab-engine docs/pricing.md
 * §3 for the canonical dollar amounts the prices represent).
 */

const ENV_KEYS: Record<Tier, Record<BillingPeriod, string>> = {
  single_state: {
    monthly: "STRIPE_PRICE_SINGLE_STATE_MONTHLY",
    annual: "STRIPE_PRICE_SINGLE_STATE_ANNUAL",
  },
  multi_state: {
    monthly: "STRIPE_PRICE_MULTI_STATE_MONTHLY",
    annual: "STRIPE_PRICE_MULTI_STATE_ANNUAL",
  },
  all_access: {
    monthly: "STRIPE_PRICE_ALL_ACCESS_MONTHLY",
    annual: "STRIPE_PRICE_ALL_ACCESS_ANNUAL",
  },
};

export function getStripePriceId(tier: Tier, billingPeriod: BillingPeriod): string {
  const envKey = ENV_KEYS[tier][billingPeriod];
  const priceId = process.env[envKey];
  if (!priceId) {
    throw new Error(
      `Stripe price ID not configured: ${envKey} env var is missing. ` +
        `Add to Vercel Production env vars after grabbing the price ID from Stripe dashboard.`,
    );
  }
  return priceId;
}

/**
 * Reverse lookup: Stripe price ID → (tier, billing_period). Used by the
 * webhook handler when processing checkout.session.completed — Stripe
 * tells us which price was purchased; we map back to our tier model.
 */
export function lookupTierFromPriceId(
  priceId: string,
): { tier: Tier; billingPeriod: BillingPeriod } | null {
  for (const tier of Object.keys(ENV_KEYS) as Tier[]) {
    for (const period of ["monthly", "annual"] as BillingPeriod[]) {
      const envValue = process.env[ENV_KEYS[tier][period]];
      if (envValue && envValue === priceId) {
        return { tier, billingPeriod: period };
      }
    }
  }
  return null;
}
