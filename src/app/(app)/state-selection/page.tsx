import { redirect } from "next/navigation";
import { StateSelectionForm } from "@/components/auth/state-selection-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getStateName } from "@/lib/constants";
import { getExcludedBusinessStates } from "@/lib/excluded-states";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Pick your trial state",
};

export default async function StateSelectionPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: customer } = await supabase
    .from("customers")
    .select("id, business_state")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // If the customer already has a trial, skip this page entirely.
  if (customer) {
    const { data: existingTrial } = await supabase
      .from("trials")
      .select("id")
      .eq("customer_id", customer.id)
      .maybeSingle();
    if (existingTrial) redirect("/");
  }

  // Load the excluded list AND re-check any stored business_state against
  // it. This catches the "excluded list expanded since this customer
  // signed up" case — they passed the signup gate at the time but no
  // longer qualify. Block them before any service delivery (load-bearing
  // legal gate per regulatory-posture.md).
  let excludedStates: string[] = [];
  let fetchError: string | null = null;
  try {
    excludedStates = await getExcludedBusinessStates();
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Unknown error";
  }

  if (fetchError) {
    return (
      <div className="max-w-md mx-auto pt-12">
        <Card>
          <CardHeader>
            <CardTitle>Couldn't load setup</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>
                We couldn't verify your account's eligibility. Try again in a
                moment, or email hi@foretab.com if this persists.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Block existing customer whose stored business_state is now excluded.
  // The actual wind-down (revoke session, churn the account) is an
  // operational follow-up; here we just refuse to proceed and surface a
  // clear message.
  if (
    customer?.business_state &&
    excludedStates.includes(customer.business_state)
  ) {
    return (
      <div className="max-w-md mx-auto pt-12">
        <Card>
          <CardHeader>
            <CardTitle>We can't start your trial</CardTitle>
            <CardDescription>
              Foretab doesn't currently operate in{" "}
              {getStateName(customer.business_state) ?? customer.business_state}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription>
                If this is a mistake or if your business is located elsewhere,
                email{" "}
                <a
                  href="mailto:hi@foretab.com?subject=Trial%20eligibility%20question"
                  className="text-primary hover:underline"
                >
                  hi@foretab.com
                </a>{" "}
                and we'll sort it out.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Sellable states come from the states_active_for_sale view (defined in
  // Phase 2 Task 9 migration 009). View auto-expands as Phase 1 ships new
  // states — no client-side hardcoding.
  const { data: states } = await supabase
    .from("states_active_for_sale")
    .select("id, state_code, authority_name, refresh_frequency")
    .order("state_code");

  const needsBusinessState = !customer?.business_state;

  return (
    <div className="max-w-md mx-auto pt-12">
      <Card>
        <CardHeader>
          <CardTitle>Pick your trial state</CardTitle>
          <CardDescription>
            Your 7-day trial gives you full access to one US state's license
            intel. You can upgrade to multi-state or all-access anytime.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StateSelectionForm
            states={states ?? []}
            excludedStates={excludedStates}
            needsBusinessState={needsBusinessState}
          />
        </CardContent>
      </Card>
    </div>
  );
}
