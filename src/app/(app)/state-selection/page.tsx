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
import { logStateSelectionResolved } from "@/lib/audit-logs";
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

  // Resolve business_state from either the customer row (set by prior visit
  // or future trigger update) OR the signup form's user_metadata (source of
  // truth for new signups — /signup writes it; the email-confirm trigger
  // doesn't currently propagate it). When both are absent we fall through
  // to the "Where is your business?" collector in the form. New signups
  // post-2026-05-29 always have it in metadata.
  const metadataBusinessState = (
    (user.user_metadata?.business_state as string | undefined) ?? ""
  )
    .trim()
    .toUpperCase();
  const resolvedBusinessState =
    customer?.business_state ?? (metadataBusinessState || null);

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

  // Sellable states come from the states_active_for_sale view (defined in
  // Phase 2 Task 9 migration 009). View auto-expands as Phase 1 ships new
  // states — no client-side hardcoding. Fetched before the excluded-state
  // gate so the audit emit (below) has the full sellable-list context.
  const { data: states } = await supabase
    .from("states_active_for_sale")
    .select("id, state_code, authority_name, refresh_frequency")
    .order("state_code");

  // ---------- AUDIT: state_selection_resolved ----------
  // Fires here (after both excluded + sellable lists are loaded) so the
  // emit covers every render path past the load-bearing legal gate: the
  // excluded-state rejection card AND the form-render. Per the
  // 2026-05-30 R2 dispatch — defensive evidence that the resolution
  // happened against the lists Foretab was using at that exact moment.
  // Best-effort (try/catch inside the helper); never blocks render.
  const wasInExcludedList = resolvedBusinessState
    ? excludedStates.includes(resolvedBusinessState)
    : false;
  const wasInSellableList = resolvedBusinessState
    ? (states ?? []).some((s) => s.state_code === resolvedBusinessState)
    : false;
  const resolvedFrom: "customers_table" | "user_metadata" | "none" =
    customer?.business_state
      ? "customers_table"
      : metadataBusinessState
        ? "user_metadata"
        : "none";
  await logStateSelectionResolved(user.id, customer?.id ?? null, {
    resolvedFrom,
    resolvedValue: resolvedBusinessState,
    // Pre-selection in the form is the AND of "in sellable list" + "not
    // excluded" — the form pre-selects the trial radio matching
    // business_state only when both hold.
    wasPreSelected: wasInSellableList && !wasInExcludedList,
    wasInSellableList,
    wasInExcludedList,
  });
  // ---------- /AUDIT ----------

  // Block existing customer whose stored OR metadata-supplied business_state
  // is now excluded. Same belt-and-suspenders check as before — but now
  // also catches metadata-supplied states that became excluded between
  // signup and email verification. The action layer also re-validates.
  if (
    resolvedBusinessState &&
    excludedStates.includes(resolvedBusinessState)
  ) {
    return (
      <div className="max-w-md mx-auto pt-12">
        <Card>
          <CardHeader>
            <CardTitle>We can't start your trial</CardTitle>
            <CardDescription>
              Foretab doesn't currently operate in{" "}
              {getStateName(resolvedBusinessState) ?? resolvedBusinessState}.
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

  // Only collect business_state on-screen when we have no source for it
  // at all (legacy customer with no /signup-form value AND no trigger
  // backfill). New post-2026-05-29 signups always have it in metadata.
  const needsBusinessState = !resolvedBusinessState;

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
            initialBusinessState={resolvedBusinessState}
          />
        </CardContent>
      </Card>
    </div>
  );
}
