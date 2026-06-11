import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SignupGate } from "@/components/auth/signup-gate";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getExcludedBusinessStates } from "@/lib/excluded-states";

export const metadata = {
  title: "Sign up",
};

// Force per-request rendering so SIGNUP_OPEN is evaluated at runtime, not
// baked at build time. Without this, Next.js statically pre-renders the page
// and the env var check is frozen into the build output — setting or unsetting
// SIGNUP_OPEN in Vercel has no effect until a new build, defeating the flag.
export const dynamic = "force-dynamic";

/**
 * SPOTLIGHT overlay (visual only): the trial card is enlarged to match the
 * marketing-grade sign-in — centered header, larger title, and generous
 * fluid padding (p-8 → sm:p-10) so the box fills its space confidently
 * instead of reading as a small cramped card. Copy, the excluded-state
 * fetch, and the gate logic are unchanged; only layout/spacing classes
 * were added.
 */
export default async function SignupPage() {
  // Read at request time (inside the function) — module-level reads can be
  // inlined by the bundler even with force-dynamic in some Next.js versions.
  const signupOpen = process.env.SIGNUP_OPEN === "true";

  if (!signupOpen) {
    return (
      <Card className="shadow-[var(--shadow-lg,0_18px_44px_rgba(0,0,0,0.4))]">
        <CardHeader className="items-center p-8 pb-3 text-center sm:p-10 sm:pb-3">
          <CardTitle className="text-3xl">Coming soon</CardTitle>
          <CardDescription className="text-[15px]">
            Foretab isn&apos;t open for signups yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-8 pt-2 sm:p-10 sm:pt-2">
          <p className="text-center text-sm text-muted-foreground">
            <a
              href="https://foretab.com/#waitlist"
              className="text-primary hover:underline"
            >
              Join the waitlist
            </a>
          </p>
        </CardContent>
      </Card>
    );
  }

  // Fetch excluded list server-side. The RPC is STABLE on the DB; one call
  // per request is fine. Failure here means we can't verify eligibility —
  // we surface an error rather than rendering a gate with the wrong list.
  let excludedStates: string[] | null = null;
  let fetchError: string | null = null;
  try {
    excludedStates = await getExcludedBusinessStates();
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Unknown error";
  }

  return (
    <Card className="shadow-[var(--shadow-lg,0_18px_44px_rgba(0,0,0,0.4))]">
      <CardHeader className="items-center p-8 pb-3 text-center sm:p-10 sm:pb-3">
        <CardTitle className="text-3xl">Start your Foretab trial</CardTitle>
        <CardDescription className="text-[15px]">
          Seven days, full single-state access. No credit card.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-8 pt-2 sm:p-10 sm:pt-2">
        {fetchError ? (
          <Alert variant="destructive">
            <AlertDescription>
              We couldn't load the signup form right now. Try again in a
              moment — or email hi@foretab.com if this persists.
            </AlertDescription>
          </Alert>
        ) : (
          <SignupGate excludedStates={excludedStates ?? []} />
        )}
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
