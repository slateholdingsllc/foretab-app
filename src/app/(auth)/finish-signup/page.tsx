import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FinishSignupForm } from "@/components/auth/finish-signup-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getExcludedBusinessStates } from "@/lib/excluded-states";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/utils";

export const metadata = { title: "Finish signing up" };

// force-dynamic so SIGNUP_OPEN is read per-request and auth state is live.
export const dynamic = "force-dynamic";

/**
 * /auth/finish-signup — interstitial for Google OAuth users who signed in
 * without going through /signup. Collects:
 *   - business_state (always, if missing)
 *   - excluded-state acknowledgment + Terms acceptance (if timestamps NULL)
 *
 * The auth/callback route redirects here when the customer row is incomplete
 * after a Google OAuth code exchange. C6's provision_trial() P0006 also
 * redirects here when business_state is NULL.
 *
 * Once all required fields are present, the action redirects to `next`
 * (default /state-selection). If the customer row is already complete,
 * the page short-circuits with redirect(next) — safe for re-visits.
 */
export default async function FinishSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const signupOpen = process.env.SIGNUP_OPEN === "true";
  if (!signupOpen) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { next: nextRaw } = await searchParams;
  const next = safeNextPath(nextRaw || "/state-selection");

  const admin = createAdminClient();
  const { data: customer } = await admin
    .from("customers")
    .select("business_state, trial_cap_disclosure_at")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // Already complete — skip to destination.
  if (customer?.business_state && customer?.trial_cap_disclosure_at) {
    redirect(next);
  }

  const needsConsent = !customer?.trial_cap_disclosure_at;

  let excludedStates: string[] = [];
  let fetchError: string | null = null;
  try {
    excludedStates = await getExcludedBusinessStates();
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Unknown error";
  }

  return (
    <Card className="shadow-[var(--shadow-lg,0_18px_44px_rgba(0,0,0,0.4))]">
      <CardHeader className="items-center p-8 pb-3 text-center sm:p-10 sm:pb-3">
        <CardTitle className="text-3xl">One more step</CardTitle>
        <CardDescription className="text-[15px]">
          {needsConsent
            ? "Tell us where your business is located and accept the Terms to continue."
            : "Tell us where your business is located to continue."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-8 pt-2 sm:p-10 sm:pt-2">
        {fetchError ? (
          <Alert variant="destructive">
            <AlertDescription>
              We couldn&apos;t load the signup form right now. Try again in a moment — or email{" "}
              <a href="mailto:hi@foretab.com" className="text-primary hover:underline">
                hi@foretab.com
              </a>{" "}
              if this persists.
            </AlertDescription>
          </Alert>
        ) : (
          <FinishSignupForm
            next={next}
            excludedStates={excludedStates}
            needsConsent={needsConsent}
          />
        )}
      </CardContent>
    </Card>
  );
}
