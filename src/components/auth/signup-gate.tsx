"use client";

import { useState } from "react";
import { GoogleButton } from "@/components/auth/google-button";
import { SignupForm } from "@/components/auth/signup-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  US_STATES_AND_DC,
  getStateName,
  isExcludedBusinessState,
} from "@/lib/constants";

/**
 * SignupGate manages the business_state field and conditionally renders the
 * auth options. State lives at this level so both SignupForm and GoogleButton
 * pick it up consistently — the gate must hold for both paths.
 *
 * Three UI states:
 *   - No state selected: render the dropdown + a hint. Auth options hidden.
 *   - Excluded state selected (CA/WA/TX/VT/OR): replace auth options with
 *     an explanatory message + email-us CTA.
 *   - Valid state selected: render auth options (Google + email/password)
 *     wired with the business_state value.
 */
export function SignupGate() {
  const [businessState, setBusinessState] = useState<string>("");

  const isExcluded = businessState && isExcludedBusinessState(businessState);
  const isValid = businessState && !isExcluded;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="business_state">Where is your business located?</Label>
        <select
          id="business_state"
          name="business_state_picker"
          value={businessState}
          onChange={(e) => setBusinessState(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">Select your state…</option>
          {US_STATES_AND_DC.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {!businessState && (
        <p className="text-xs text-muted-foreground">
          We ask up front because Foretab doesn't currently operate in a handful
          of states.
        </p>
      )}

      {isExcluded && (
        <Alert>
          <AlertDescription>
            Foretab doesn't currently operate in {getStateName(businessState)}. If
            you'd like to be notified when we expand, send a note to{" "}
            <a
              href="mailto:hi@foretab.com?subject=Notify%20me%20when%20Foretab%20expands"
              className="text-primary hover:underline"
            >
              hi@foretab.com
            </a>
            .
          </AlertDescription>
        </Alert>
      )}

      {isValid && (
        <>
          <GoogleButton next="/state-selection" businessState={businessState} />
          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-input" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>
          <SignupForm businessState={businessState} />
        </>
      )}
    </div>
  );
}
