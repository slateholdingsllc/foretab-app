/**
 * Foretab pricing constants. Mirrors foretab-engine docs/pricing.md §3.
 * Source of truth lives in the engine docs; this file is the customer-app
 * copy used at trial-expired display + renewal reminder emails (the
 * "recurring charge amount" Colorado SB25-145 / Terms § 8 requires).
 *
 * Annual framing: "2 months free" — annual is exactly 10× monthly
 * (~16.7% off vs 12× monthly). When prices change, update BOTH this
 * file AND foretab-engine docs/pricing.md, AND any Stripe product
 * configuration. Cross-repo drift here = legally-bad billing disclosures.
 */

export type Tier = "single_state" | "multi_state" | "all_access";
export type BillingPeriod = "monthly" | "annual";

export const TIER_PRICING: Record<Tier, Record<BillingPeriod, number>> = {
  single_state: { monthly: 79, annual: 790 },
  multi_state: { monthly: 249, annual: 2490 },
  all_access: { monthly: 399, annual: 3990 },
};

export const TIER_DISPLAY_NAMES: Record<Tier, string> = {
  single_state: "Single state",
  multi_state: "Multi-state",
  all_access: "All-Access",
};

// How many states a customer can pick per tier. all_access doesn't pick —
// every sellable state is granted at checkout (handleCheckoutSessionCompleted).
// TODO(configurable-not-hardcoded): move to public.app_config when a second
// tier limit needs adjusting. Today these mirror foretab-engine docs/pricing.md §3.
export const TIER_STATE_COUNT: Record<Tier, number> = {
  single_state: 1,
  multi_state: 5,
  all_access: Number.POSITIVE_INFINITY,
};

export function getChargeAmount(tier: Tier, billingPeriod: BillingPeriod): number {
  return TIER_PRICING[tier][billingPeriod];
}

/**
 * USD formatter. Whole-dollar display — Foretab pricing is integer USD.
 */
export function formatCurrency(amountUsd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountUsd);
}
