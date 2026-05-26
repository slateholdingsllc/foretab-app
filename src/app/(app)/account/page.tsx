import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/dashboard/app-shell";
import { ProfileSection } from "@/components/account/profile-section";
import { StateManagementSection } from "@/components/account/state-management-section";
import { SubscriptionSection } from "@/components/account/subscription-section";
import {
  fetchAccessibleStateCodes,
  fetchCustomerContext,
} from "@/lib/dashboard/queries";
import { createClient } from "@/lib/supabase/server";

/**
 * /account — the customer's hub for managing their profile, subscription,
 * and state access. Surfaces:
 *   - Profile section (read-only display of email + business state)
 *   - Subscription section (tier, billing period, next charge, cancel
 *     status; Manage Billing + Cancel CTAs both visible per the legal
 *     reviewer's parallel principle — cancel must be equally findable
 *     as upgrade)
 *   - State management section (picker for single/multi tiers, read-only
 *     summary for all_access; trial-only customers see a CTA to upgrade)
 *
 * Cancel flow respects Terms §10: clicking Cancel opens the Stripe Portal
 * with subscription_cancel pre-selected. Stripe sets cancel_at_period_end,
 * customer keeps access through current_period_end — never an immediate
 * cut.
 *
 * Refund Policy §3 is NOT exposed here. Refunds are operator-initiated
 * via Stripe Dashboard and end access immediately on processing.
 */
export const metadata = {
  title: "Account",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: customer } = await supabase
    .from("customers")
    .select("id, email, business_state, current_tier, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!customer) redirect("/verify-email");

  // Latest subscription (any status) — drives the subscription section.
  // Most recent first by period end; null for trial-only customers.
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select(
      "tier, billing_period, status, current_period_end, cancel_at_period_end, canceled_at",
    )
    .eq("customer_id", customer.id)
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Customer's current state grants — joined to states for display info.
  // Authenticated SELECT under RLS returns only their own rows.
  const { data: stateRows } = await supabase
    .from("customer_states")
    .select(
      "state_id, granted_via, states ( state_code, refresh_frequency )",
    )
    .eq("customer_id", customer.id);
  const grantedStates = (stateRows ?? []) as unknown as Array<{
    state_id: string;
    granted_via: string;
    states: { state_code: string | null; refresh_frequency: string | null } | null;
  }>;

  // Sellable state catalog — passed to state picker so it can show the
  // states a customer COULD pick. Read-only data; same RPC the trial picker uses.
  const { data: sellableRows } = await supabase
    .from("states_active_for_sale")
    .select("id, state_code, refresh_frequency");
  const sellableStates = (sellableRows ?? []) as Array<{
    id: string;
    state_code: string | null;
    refresh_frequency: string | null;
  }>;

  const [context, accessibleStateCodes] = await Promise.all([
    fetchCustomerContext(),
    fetchAccessibleStateCodes(),
  ]);

  const resolvedSearchParams = await searchParams;
  const justCancelled = resolvedSearchParams.cancelled === "1";
  const justUpdated = resolvedSearchParams.updated === "1";
  const errorMessage =
    typeof resolvedSearchParams.error === "string" ? resolvedSearchParams.error : null;

  return (
    <AppShell
      email={context.email}
      currentTier={context.currentTier}
      trialExpiresAt={context.trialExpiresAt}
      accessibleStateCodes={accessibleStateCodes}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
          <Link
            href="/"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to dashboard
          </Link>
        </header>

        {justCancelled ? (
          <div className="rounded-md border border-input bg-muted/40 p-3 text-sm">
            Cancellation processed. You'll keep access through the end of your
            current billing period — see below for the date.
          </div>
        ) : null}
        {justUpdated ? (
          <div className="rounded-md border border-input bg-muted/40 p-3 text-sm">
            States updated.
          </div>
        ) : null}
        {errorMessage ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <ProfileSection
          email={customer.email ?? user.email ?? null}
          businessState={customer.business_state ?? null}
          status={customer.status ?? null}
        />

        <SubscriptionSection
          tier={(customer.current_tier as "single_state" | "multi_state" | "all_access" | null) ?? null}
          subscription={subscription ?? null}
        />

        <StateManagementSection
          tier={(customer.current_tier as "single_state" | "multi_state" | "all_access" | null) ?? null}
          grantedStates={grantedStates}
          sellableStates={sellableStates}
        />
      </div>
    </AppShell>
  );
}
