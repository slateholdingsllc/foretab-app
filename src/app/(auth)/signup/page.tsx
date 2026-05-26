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

export default async function SignupPage() {
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
    <Card>
      <CardHeader>
        <CardTitle>Start your Foretab trial</CardTitle>
        <CardDescription>
          Seven days, full single-state access. No credit card.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
