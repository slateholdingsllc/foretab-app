import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { TIER_PRICING, type BillingPeriod, type Tier } from "@/lib/pricing";
import { getStripePriceId } from "@/lib/stripe/prices";

/**
 * GET /api/cron/price-check
 *
 * Fetches each of the 6 configured Stripe price IDs and compares their
 * unit_amount to TIER_PRICING × 100 (Stripe stores amounts in cents).
 * Logs loudly and returns mismatches in the response body so they appear
 * in Vercel Function logs and the JSON response for manual inspection.
 *
 * Call with ?test=1 to run from the browser without waiting for the cron
 * schedule. Same CRON_SECRET auth as the other cron routes.
 *
 * Run this after any Stripe price rotation to confirm the env vars and
 * the DB constants are in sync.
 */

const TIERS: Tier[] = ["single_state", "multi_state", "all_access"];
const PERIODS: BillingPeriod[] = ["monthly", "annual"];

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

  const stripe = getStripe();
  const mismatches: Array<{
    tier: Tier;
    period: BillingPeriod;
    priceId: string;
    expected: number;
    actual: number | null;
  }> = [];
  const errors: Array<{ tier: Tier; period: BillingPeriod; error: string }> = [];
  const checked: Array<{ tier: Tier; period: BillingPeriod; priceId: string; unitAmount: number }> =
    [];

  for (const tier of TIERS) {
    for (const period of PERIODS) {
      let priceId: string;
      try {
        priceId = getStripePriceId(tier, period);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push({ tier, period, error: `env var missing: ${message}` });
        continue;
      }

      try {
        const price = await stripe.prices.retrieve(priceId);
        const expectedCents = TIER_PRICING[tier][period] * 100;
        const actualCents = price.unit_amount;

        if (actualCents !== expectedCents) {
          console.error(
            `[cron/price-check] MISMATCH ${tier}/${period}: expected ${expectedCents}¢, got ${actualCents}¢ (price ${priceId})`,
          );
          mismatches.push({ tier, period, priceId, expected: expectedCents, actual: actualCents });
        } else {
          checked.push({ tier, period, priceId, unitAmount: actualCents });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[cron/price-check] Failed to fetch ${priceId} (${tier}/${period}):`, message);
        errors.push({ tier, period, error: message });
      }
    }
  }

  if (mismatches.length > 0) {
    console.error(
      `[cron/price-check] ${mismatches.length} price mismatch(es) detected — Stripe prices out of sync with TIER_PRICING`,
    );
  }

  return NextResponse.json({
    ok: mismatches.length === 0 && errors.length === 0,
    checked: checked.length,
    mismatches,
    errors,
  });
}
