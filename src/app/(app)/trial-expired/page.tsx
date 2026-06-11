import Link from "next/link";
import { redirect } from "next/navigation";
import { SubscribeButton } from "@/components/checkout/subscribe-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  TIER_DISPLAY_NAMES,
  TIER_PRICING,
  type Tier,
  formatCurrency,
} from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Choose a plan",
};

const TIER_ORDER: Array<{ key: Tier; description: (stateCount: number) => string }> = [
  {
    key: "single_state",
    description: () => "Full access to one US state of your choice.",
  },
  {
    key: "multi_state",
    description: () => "Any 5 US states.",
  },
  {
    key: "all_access",
    description: (stateCount) =>
      stateCount > 0
        ? `Every state we currently serve (${stateCount}). New states added as we expand.`
        : "Every state we currently serve. New states added as we expand.",
  },
];

export default async function TrialExpiredPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: customer } = await supabase
    .from("customers")
    .select("id, current_tier")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!customer) redirect("/verify-email");

  // Paid already? Back to dashboard.
  if (customer.current_tier) redirect("/");

  const { data: trial } = await supabase
    .from("trials")
    .select("expires_at")
    .eq("customer_id", customer.id)
    .maybeSingle();
  if (!trial) redirect("/state-selection");

  // Active-trial customers reach this page when they click "Upgrade" /
  // "Choose a plan" — that's a normal customer want, not a redirect-out
  // situation. The previous gate ("trial not yet expired → /") was
  // bouncing them straight back to the dashboard, severing the upgrade
  // funnel. Now we serve the page in both cases and adapt copy.
  const trialExpired = new Date(trial.expires_at) < new Date();

  // For All-Access description, count currently-sellable states.
  const { count: stateCount } = await supabase
    .from("states_active_for_sale")
    .select("*", { count: "exact", head: true });
  const stateCountSafe = stateCount ?? 0;

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="mx-auto max-w-3xl space-y-6 pt-12">
        {!trialExpired && (
          <div>
            <Link
              href="/"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              ← Back to dashboard
            </Link>
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle>
              {trialExpired ? "Your trial has ended" : "Choose a plan"}
            </CardTitle>
            <CardDescription>
              {trialExpired
                ? "Pick a plan to keep your data flowing. Your trial state and saved filters are preserved — subscribe within 30 days and you pick up right where you left off."
                : "Subscribe any time during your trial to lock in your plan. Your trial state and saved filters carry over automatically."}
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {TIER_ORDER.map((t) => {
            const monthly = TIER_PRICING[t.key].monthly;
            const annual = TIER_PRICING[t.key].annual;
            return (
              <Card key={t.key} className="flex flex-col">
                <CardHeader>
                  <CardTitle className="text-lg">{TIER_DISPLAY_NAMES[t.key]}</CardTitle>
                  <CardDescription>{t.description(stateCountSafe)}</CardDescription>
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
                      >
                        Subscribe monthly · {formatCurrency(monthly)}/mo
                      </SubscribeButton>
                      <SubscribeButton
                        tier={t.key}
                        billingPeriod="annual"
                        className="w-full"
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

        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            <p>
              Need a different state mix or a custom contract?{" "}
              <Link
                href="mailto:hi@foretab.com?subject=Custom%20plan"
                className="text-primary hover:underline"
              >
                Email hi@foretab.com
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
