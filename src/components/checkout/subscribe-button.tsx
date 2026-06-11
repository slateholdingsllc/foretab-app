"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createCheckoutSession } from "@/lib/actions/checkout";
import type { BillingPeriod, Tier } from "@/lib/pricing";

/**
 * Subscribe button that submits to createCheckoutSession server action.
 * On success: server action redirects to Stripe Checkout (no client
 * navigation needed). On failure: inline error.
 *
 * Used on /trial-expired (post-trial conversion) and future /account
 * (tier change). Each tier card on /trial-expired renders TWO buttons
 * (monthly + annual) so customers see both prices and pick directly.
 */
export function SubscribeButton({
  tier,
  billingPeriod,
  children,
  className,
  disabled: disabledProp,
}: {
  tier: Tier;
  billingPeriod: BillingPeriod;
  children: React.ReactNode;
  className?: string;
  /** Gate from the pre-charge acknowledgment checkbox. */
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        setError(null);
        formData.set("tier", tier);
        formData.set("billing_period", billingPeriod);
        startTransition(async () => {
          const result = await createCheckoutSession(formData);
          if (result && !result.ok) setError(result.error);
        });
      }}
    >
      <Button type="submit" disabled={pending || disabledProp} className={className}>
        {pending ? "Redirecting..." : children}
      </Button>
      {error ? (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
