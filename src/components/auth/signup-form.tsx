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
}: {
  businessState?: string;
  /**
   * ISO timestamp captured at the moment the customer checked the
   * excluded-state acknowledgment in SignupGate. Null when not yet
   * checked OR when business_state has changed since (reset). When null,
   * the submit button is disabled — the customer must affirm before any
   * /signup POST can fire. The action persists this value into
   * user_metadata.excluded_state_acknowledgment_at; the Phase 2 Task 11
   * trigger propagates it to customers.excluded_state_acknowledgment_at.
   */
  acknowledgedAt?: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canSubmit = !pending && acknowledgedAt !== null && acknowledgedAt !== undefined;

  return (
    <form
      action={(formData) => {
        setError(null);
        // SignupGate enforces this is non-empty + non-excluded before
        // rendering us; pass through for server-side re-validation.
        if (businessState) formData.set("business_state", businessState);
        if (acknowledgedAt) {
          formData.set("excluded_state_acknowledgment_at", acknowledgedAt);
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
