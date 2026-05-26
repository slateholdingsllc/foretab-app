import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
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
  title: "Your trial has ended",
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

  const expiredAt = new Date(trial.expires_at);
  if (expiredAt > new Date()) {
    // Trial not yet expired — back to dashboard
    redirect("/");
  }

  // For All-Access description, count currently-sellable states.
  const { count: stateCount } = await supabase
    .from("states_active_for_sale")
    .select("*", { count: "exact", head: true });
  const stateCountSafe = stateCount ?? 0;

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="mx-auto max-w-3xl space-y-6 pt-12">
        <Card>
          <CardHeader>
            <CardTitle>Your trial has ended</CardTitle>
            <CardDescription>
              Pick a plan to keep your data flowing. Your trial state and saved
              filters are preserved — subscribe within 30 days and you pick up
              right where you left off.
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
                <CardContent className="flex-1 space-y-3">
                  <div>
                    <div className="text-2xl font-bold">{formatCurrency(monthly)}/mo</div>
                    <div className="text-sm text-muted-foreground">
                      or {formatCurrency(annual)}/yr (10% off)
                    </div>
                  </div>
                  <Button
                    disabled
                    className="w-full"
                    title="Self-serve subscriptions launch with Task 10. Email hi@foretab.com to subscribe today."
                  >
                    Subscribe (soon)
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardContent className="space-y-2 p-4 text-sm text-muted-foreground">
            <p>
              Want to subscribe right now?{" "}
              <a
                href="mailto:hi@foretab.com?subject=Subscribe%20to%20Foretab"
                className="text-primary hover:underline"
              >
                Email hi@foretab.com
              </a>{" "}
              and we&apos;ll set you up directly. Self-serve checkout is
              launching shortly.
            </p>
            <p>
              Need a different state mix or a custom contract?{" "}
              <Link
                href="mailto:hi@foretab.com?subject=Custom%20plan"
                className="text-primary hover:underline"
              >
                Let&apos;s talk
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
