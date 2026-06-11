"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/lib/actions/auth";

export function GoogleButton({
  next = "/",
  businessState,
  disabled = false,
  acknowledgedAt,
  termsAcceptedAt,
}: {
  next?: string;
  businessState?: string;
  /**
   * External disable signal. On /signup, SignupGate blocks the Google flow
   * until both the excluded-state acknowledgment AND the Terms acceptance
   * checkbox are checked — same gating as the email/password submit button.
   * Defaults to false so /login is unaffected.
   */
  disabled?: boolean;
  /**
   * ISO timestamp from the excluded-state acknowledgment checkbox. Forwarded
   * through the OAuth round-trip as a `redirectTo` query param and written to
   * customers.excluded_state_acknowledgment_at by /auth/callback after
   * exchangeCodeForSession. Absent on the /login flow (returning user).
   */
  acknowledgedAt?: string | null;
  /**
   * ISO timestamp from the Terms acceptance checkbox. Forwarded through the
   * OAuth round-trip as a `redirectTo` query param and written to
   * customers.trial_cap_disclosure_at + customers.arbitration_optout_
   * disclosure_at by /auth/callback after exchangeCodeForSession.
   * Absent on the /login flow (returning user).
   */
  termsAcceptedAt?: string | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        formData.set("next", next);
        if (businessState) formData.set("business_state", businessState);
        // Consent timestamps forwarded to signInWithGoogle, which encodes them
        // in the OAuth redirectTo URL so they survive the round-trip.
        if (acknowledgedAt) {
          formData.set("excluded_state_acknowledgment_at", acknowledgedAt);
        }
        if (termsAcceptedAt) {
          formData.set("terms_accepted_at", termsAcceptedAt);
        }
        startTransition(async () => {
          await signInWithGoogle(formData);
        });
      }}
    >
      <Button
        type="submit"
        variant="outline"
        className="w-full"
        disabled={pending || disabled}
      >
        <GoogleIcon />
        {pending ? "Redirecting..." : "Continue with Google"}
      </Button>
    </form>
  );
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.44c-.28 1.4-1.07 2.59-2.28 3.4v2.84h3.68c2.15-1.98 3.4-4.9 3.4-8.48z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.94-2.92l-3.68-2.84c-1.02.68-2.31 1.09-4.26 1.09-3.27 0-6.04-2.21-7.03-5.17H1.18v3.25C3.16 21.3 7.27 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M4.97 14.16c-.25-.74-.39-1.53-.39-2.34s.14-1.6.39-2.34V6.23H1.18C.43 7.74 0 9.83 0 12s.43 4.26 1.18 5.77l3.79-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 4.74c1.78 0 3.37.61 4.62 1.81l3.27-3.27C17.95 1.19 15.24 0 12 0 7.27 0 3.16 2.7 1.18 6.23l3.79 3.25C5.96 6.5 8.73 4.74 12 4.74z"
      />
    </svg>
  );
}
