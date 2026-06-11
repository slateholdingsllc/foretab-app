"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp } from "@/lib/actions/auth";

export function SignupForm({
  businessState,
  acknowledgedAt,
  termsAcceptedAt,
}: {
  businessState?: string;
  /**
   * ISO timestamp from the excluded-state acknowledgment checkbox (R1).
   * Null until checked or when business_state changes. Submit disabled
   * when null.
   */
  acknowledgedAt?: string | null;
  /**
   * ISO timestamp from the Terms acceptance checkbox (R4). Null until
   * checked or when business_state changes. Submit disabled when null.
   * Server persists to customers.trial_cap_disclosure_at and
   * customers.arbitration_optout_disclosure_at via handle_email_confirmed.
   */
  termsAcceptedAt?: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canSubmit =
    !pending && acknowledgedAt !== null && acknowledgedAt !== undefined &&
    termsAcceptedAt !== null && termsAcceptedAt !== undefined;

  return (
    <form
      action={(formData) => {
        setError(null);
        if (businessState) formData.set("business_state", businessState);
        if (acknowledgedAt) {
          formData.set("excluded_state_acknowledgment_at", acknowledgedAt);
        }
        if (termsAcceptedAt) {
          formData.set("terms_accepted_at", termsAcceptedAt);
        }
        startTransition(async () => {
          const result = await signUp(formData);
          if (result && !result.ok) setError(result.error);
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          At least 8 characters, with upper, lower, and a number.
        </p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={!canSubmit}>
        {pending ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
