import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TIER_DISPLAY_NAMES,
  formatCurrency,
  getChargeAmount,
  type BillingPeriod,
  type Tier,
} from "@/lib/pricing";
import { createPortalSession } from "@/lib/actions/checkout";
import { createCancelPortalSession } from "@/lib/actions/account";

type Subscription = {
  tier: string | null;
  billing_period: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  canceled_at: string | null;
};

/**
 * Subscription details + Stripe Portal CTAs.
 *
 * Cancel/Manage parallel principle: both buttons are equally prominent.
 * Cancel routes to Stripe Portal with flow_data.type='subscription_cancel'
 * so the customer lands on the cancel step directly. Manage Billing opens
 * the general portal (payment method, invoices, plan changes).
 *
 * If the subscription is already in cancel_at_period_end, we surface the
 * end date and swap the Cancel CTA for "Resume subscription" which routes
 * to the general portal (Stripe Portal exposes uncancel there).
 *
 * Trial-only customers (no subscription row yet) see an Upgrade CTA
 * instead — keeps the page useful before checkout.
 */
export function SubscriptionSection({
  tier,
  subscription,
}: {
  tier: Tier | null;
  subscription: Subscription | null;
}) {
  if (!tier || !subscription) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            You're on the free trial. Upgrade to keep access after the trial ends.
          </p>
          <Button asChild>
            <Link href="/trial-expired">Choose a plan</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const billingPeriod = (subscription.billing_period ?? "monthly") as BillingPeriod;
  const charge = getChargeAmount(tier, billingPeriod);
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  const isPendingCancellation = subscription.cancel_at_period_end === true;
  const isCancelled = subscription.status === "canceled";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Subscription</CardTitle>
        <StatusBadge
          status={subscription.status}
          pendingCancel={isPendingCancellation}
        />
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-2">
          <Row label="Plan" value={TIER_DISPLAY_NAMES[tier]} />
          <Row label="Billing" value={billingPeriod === "annual" ? "Annual" : "Monthly"} />
          <Row
            label={billingPeriod === "annual" ? "Annual charge" : "Monthly charge"}
            value={formatCurrency(charge)}
          />
          {periodEnd ? (
            <Row
              label={isPendingCancellation ? "Access ends" : "Next charge"}
              value={periodEnd.toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            />
          ) : null}
        </div>

        {isPendingCancellation && periodEnd ? (
          <p className="rounded-md border border-input bg-muted/40 p-3 text-xs text-muted-foreground">
            Your subscription is set to cancel at the end of the current billing
            period. You'll keep access until{" "}
            <strong className="text-foreground">
              {periodEnd.toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </strong>
            . Use Manage Billing to resume.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-input pt-3">
          <form action={createPortalSession}>
            <Button type="submit" variant="outline">
              Manage billing
            </Button>
          </form>
          {!isPendingCancellation && !isCancelled ? (
            <form action={createCancelPortalSession}>
              <Button type="submit" variant="outline">
                Cancel subscription
              </Button>
            </form>
          ) : null}
          <p className="basis-full text-xs text-muted-foreground">
            Billing portal includes payment method, invoice history, and plan
            changes. Cancellations keep access through the end of the current
            billing period (Terms § 10).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-input/60 py-2 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function StatusBadge({
  status,
  pendingCancel,
}: {
  status: string | null;
  pendingCancel: boolean;
}) {
  if (pendingCancel) {
    return <Badge variant="warm">Ends soon</Badge>;
  }
  if (status === "active") return <Badge variant="default">Active</Badge>;
  if (status === "past_due") return <Badge variant="urgent">Past due</Badge>;
  if (status === "canceled") return <Badge variant="outline">Cancelled</Badge>;
  if (status === "trialing") return <Badge variant="brand">Trial</Badge>;
  return <Badge variant="outline">{status ?? "Unknown"}</Badge>;
}
