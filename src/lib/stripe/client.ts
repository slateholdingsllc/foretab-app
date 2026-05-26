import Stripe from "stripe";

/**
 * Stripe SDK singleton. Pinned to a specific apiVersion so a future
 * Stripe API change doesn't silently alter our behavior — bumping the
 * pin is an explicit decision.
 *
 * Used by:
 *   - /api/stripe/webhook (event signature verify + parse)
 *   - server actions in src/lib/actions/checkout.ts (Checkout Session
 *     + Customer Portal session creation)
 *
 * NOT used by:
 *   - src/lib/email/renewal-reminder.ts (uses fetch against Stripe REST
 *     API directly to avoid bundling the SDK into the cron route)
 */

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "getStripe() requires STRIPE_SECRET_KEY env var (server-only, no NEXT_PUBLIC_ prefix)",
    );
  }
  _stripe = new Stripe(key, {
    apiVersion: "2026-04-22.dahlia",
  });
  return _stripe;
}
