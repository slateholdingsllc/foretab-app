/**
 * Foretab pricing constants. Mirrors foretab-engine docs/pricing.md §3.
 * Source of truth lives in the engine docs; this file is the customer-app
 * copy used at trial-expired display + renewal reminder emails (the
 * "recurring charge amount" Colorado SB25-145 / Terms § 8 requires).
 *
 * Annual = 12 monthly × 10% off (rounded). When prices change, update
 * BOTH this file AND foretab-engine docs/pricing.md, AND any Stripe
 * product configuration. Cross-repo drift here = legally-bad billing
 * disclosures.
 */

export type Tier = "single_state" | "multi_state" | "all_access";
export type BillingPeriod = "monthly" | "annual";

export const TIER_PRICING: Record<Tier, Record<BillingPeriod, number>> = {
  single_state: { monthly: 79, annual: 853 },
  multi_state: { monthly: 179, annual: 1933 },
  all_access: { monthly: 349, annual: 3769 },
};

export const TIER_DISPLAY_NAMES: Record<Tier, string> = {
  single_state: "Single state",
  multi_state: "Multi-state",
  all_access: "All-Access",
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
