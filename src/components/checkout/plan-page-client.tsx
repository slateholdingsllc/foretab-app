"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { writeCheckoutAcknowledgment } from "@/lib/actions/checkout";
import { TIER_DISPLAY_NAMES, TIER_PRICING, formatCurrency, type Tier } from "@/lib/pricing";
import { SubscribeButton } from "./subscribe-button";

export interface PlanTierConfig {
  key: Tier;
  description: string;
}

/**
 * Client component for the plan-selection page. Manages the pre-charge
 * acknowledgment state that gates all subscribe buttons (ROSCA / CA-ARL /
 * CO SB25-145).
 *
 * On checkbox check: writes checkout_acknowledgment_at to the customer row
 * (server action; best-effort — see AGENT-B note in actions/checkout.ts).
 * On uncheck: re-disables the buttons; does NOT un-write the timestamp
 * (the timestamp records the first time the disclosure was acknowledged).
 */
export function PlanPageClient({ tiers }: { tiers: PlanTierConfig[] }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [, startTransition] = useTransition();

  function handleAcknowledge(e: React.ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked;
    setAcknowledged(checked);
    if (checked) {
      startTransition(async () => {
        await writeCheckoutAcknowledgment();
      });
    }
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {tiers.map((t) => {
          const monthly = TIER_PRICING[t.key].monthly;
          const annual = TIER_PRICING[t.key].annual;
          return (
            <Card key={t.key} className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg">{TIER_DISPLAY_NAMES[t.key]}</CardTitle>
                <CardDescription>{t.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <div className="mt-auto space-y-3">
                  <div>
                    <div className="text-2xl font-bold">{formatCurrency(monthly)}/mo</div>
                    <div className="text-sm text-muted-foreground">
                      or {formatCurrency(annual)}/yr (2 months free)
                    </div>
                  </div>
                  <div className="space-y-2">
                    <SubscribeButton
                      tier={t.key}
                      billingPeriod="monthly"
                      className="w-full"
                      disabled={!acknowledged}
                    >
                      Subscribe monthly · {formatCurrency(monthly)}/mo
                    </SubscribeButton>
                    <SubscribeButton
                      tier={t.key}
                      billingPeriod="annual"
                      className="w-full"
                      disabled={!acknowledged}
                    >
                      Subscribe yearly · {formatCurrency(annual)}/yr
                    </SubscribeButton>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Auto-renewal + refund disclosures (ROSCA / CA-ARL / CO SB25-145) */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="space-y-3 text-sm">
            <p className="font-medium text-foreground">Subscription terms</p>

            {/* Auto-renewal with amounts + frequency for each plan */}
            <div className="space-y-1 text-muted-foreground">
              <p>
                Subscriptions automatically renew at the end of each billing period at
                the rates shown above:
              </p>
              <ul className="mt-2 space-y-1 pl-4">
                {tiers.map((t) => (
                  <li key={t.key} className="flex gap-2">
                    <span className="min-w-[110px] font-medium text-foreground">
                      {TIER_DISPLAY_NAMES[t.key]}
                    </span>
                    <span>
                      {formatCurrency(TIER_PRICING[t.key].monthly)}/month, billed monthly;
                      or {formatCurrency(TIER_PRICING[t.key].annual)}/year, billed annually
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Cancellation method */}
            <p className="text-muted-foreground">
              You may cancel at any time from your{" "}
              <span className="font-medium text-foreground">Account page</span>.
              Cancellation takes effect at the end of the current billing period; no
              further charges are made after that date.
            </p>

            {/* Refund notice */}
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Refund policy:</span> Initial
              paid subscriptions are eligible for a full refund within{" "}
              <span className="font-medium text-foreground">7 days</span> of the first
              charge. No partial refunds are available after the 7-day window has
              passed.
            </p>
          </div>

          {/* Pre-charge acknowledgment — SEPARATE from the ToS checkbox at signup */}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-input bg-card p-3 text-sm transition-colors hover:bg-surface-2">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={handleAcknowledge}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--color-accent)]"
            />
            <span className="text-foreground">
              I understand my subscription will automatically renew at the rate shown for
              my selected plan, and that refunds are limited to the 7-day window
              described above.
            </span>
          </label>

          {!acknowledged && (
            <p className="text-xs text-muted-foreground">
              Please review the terms above and check the box to enable the Subscribe
              buttons.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
