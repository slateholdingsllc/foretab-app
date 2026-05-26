import { Resend } from "resend";
import {
  type BillingPeriod,
  type Tier,
  TIER_DISPLAY_NAMES,
  formatCurrency,
  getChargeAmount,
} from "@/lib/pricing";

/**
 * Subscription auto-renewal reminder email. Sent 25-40 days before an
 * annual subscription's current_period_end per Colorado SB25-145 +
 * Terms § 8. Must include:
 *   1. Renewal date
 *   2. Recurring charge amount
 *   3. One-step cancellation link (Stripe Customer Portal cancel flow)
 *
 * One-step cancel requires STRIPE_SECRET_KEY (server-side) — Task 10
 * lands that. Until then, the link falls back to a Foretab account
 * page placeholder. The cron itself won't run effectively until
 * Task 10 populates the subscriptions table; this fallback only
 * matters if someone manually triggers the cron pre-Task-10.
 */

type SendArgs = {
  recipientEmail: string;
  tier: Tier;
  billingPeriod: BillingPeriod;
  /** ISO timestamp of subscription.current_period_end */
  renewalDate: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
};

export async function sendRenewalReminder(args: SendArgs): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY env var not set");
  }
  const resend = new Resend(apiKey);

  const chargeAmount = getChargeAmount(args.tier, args.billingPeriod);
  const formattedAmount = formatCurrency(chargeAmount);
  const renewalDate = new Date(args.renewalDate);
  const renewalDateDisplay = renewalDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const tierDisplay = TIER_DISPLAY_NAMES[args.tier];

  const cancelLink = await generateCancelLink({
    stripeCustomerId: args.stripeCustomerId,
    stripeSubscriptionId: args.stripeSubscriptionId,
  });

  const result = await resend.emails.send({
    from: "Foretab <hi@foretab.com>",
    to: args.recipientEmail,
    subject: `Your Foretab subscription renews on ${renewalDateDisplay}`,
    html: renderHtml({
      tierDisplay,
      formattedAmount,
      renewalDateDisplay,
      cancelLink,
      billingPeriodNoun: args.billingPeriod === "annual" ? "annual" : "monthly",
    }),
    text: renderText({
      tierDisplay,
      formattedAmount,
      renewalDateDisplay,
      cancelLink,
      billingPeriodNoun: args.billingPeriod === "annual" ? "annual" : "monthly",
    }),
  });

  if (result.error) {
    throw new Error(`Resend send failed: ${result.error.message}`);
  }
  return { id: result.data?.id ?? "" };
}

/**
 * Stripe Customer Portal session with flow_data set to the cancel flow.
 * Returns a one-time URL that takes the customer directly into the
 * cancel-confirmation flow — counts as "one step" per Colorado ARL.
 *
 * Uses fetch against Stripe's REST API rather than the Stripe SDK to
 * avoid bundling the SDK when this path may not even execute (gated
 * on STRIPE_SECRET_KEY presence).
 */
async function generateCancelLink(args: {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}): Promise<string> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    // Task 10 (Stripe integration) not yet shipped — fallback to a
    // Foretab-side account page. Note: this is NOT one-step cancellation
    // per ARL. The cron itself shouldn't be firing real emails until
    // STRIPE_SECRET_KEY is set, because subscriptions are populated by
    // Task 10's webhooks. Defensive fallback only.
    return "https://app.foretab.com/account";
  }

  const body = new URLSearchParams({
    customer: args.stripeCustomerId,
    return_url: "https://app.foretab.com/account?cancelled=true",
    "flow_data[type]": "subscription_cancel",
    "flow_data[subscription_cancel][subscription]": args.stripeSubscriptionId,
  });

  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stripe API error (${response.status}): ${errorText}`);
  }
  const data = (await response.json()) as { url: string };
  return data.url;
}

type TemplateArgs = {
  tierDisplay: string;
  formattedAmount: string;
  renewalDateDisplay: string;
  cancelLink: string;
  billingPeriodNoun: string;
};

function renderHtml(t: TemplateArgs): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1f2328; line-height: 1.6;">
  <p style="margin: 0 0 16px;">Hi,</p>
  <p style="margin: 0 0 16px;">Your Foretab <strong>${t.tierDisplay}</strong> ${t.billingPeriodNoun} subscription will automatically renew on <strong>${t.renewalDateDisplay}</strong>.</p>
  <p style="margin: 0 0 16px;">You'll be charged <strong>${t.formattedAmount}</strong> on that date for the next ${t.billingPeriodNoun} term.</p>
  <p style="margin: 0 0 32px;">If you'd like to cancel before the renewal, you can do it in one step here:</p>
  <p style="margin: 0 0 32px;">
    <a href="${t.cancelLink}" style="display: inline-block; padding: 12px 24px; background: #2A7BFF; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Cancel before renewal</a>
  </p>
  <p style="margin: 0 0 16px; color: #6e7781; font-size: 14px;">If you have any questions, just reply to this email.</p>
  <p style="margin: 0; color: #6e7781; font-size: 14px;">— Britt, Foretab</p>
</body>
</html>`;
}

function renderText(t: TemplateArgs): string {
  return `Hi,

Your Foretab ${t.tierDisplay} ${t.billingPeriodNoun} subscription will automatically renew on ${t.renewalDateDisplay}.

You'll be charged ${t.formattedAmount} on that date for the next ${t.billingPeriodNoun} term.

If you'd like to cancel before the renewal, you can do it in one step here:

${t.cancelLink}

If you have any questions, just reply to this email.

— Britt, Foretab`;
}
