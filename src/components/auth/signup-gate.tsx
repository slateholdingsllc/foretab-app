"use client";

import { useEffect, useState } from "react";
import { GoogleButton } from "@/components/auth/google-button";
import { SignupForm } from "@/components/auth/signup-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { US_STATES_AND_DC, getStateName } from "@/lib/constants";

/**
 * SignupGate manages the business_state field, the explicit excluded-state
 * representation, and conditionally renders the auth options. State lives at
 * this level so both SignupForm and GoogleButton pick up the same values —
 * the gate must hold for both paths.
 *
 * Four UI states:
 *   - No state selected: render the dropdown + a hint. Auth options hidden.
 *   - Excluded state selected: replace auth options with an explanatory
 *     message + email-us CTA.
 *   - Valid state selected, acknowledgment not yet given: render the
 *     dropdown + the acknowledgment checkbox; Google + email/password
 *     are rendered but disabled until the checkbox is checked.
 *   - Valid state + acknowledgment given: auth options enabled.
 *
 * excludedStates is passed in from the server component parent — it's
 * fetched from public.excluded_business_states() at request time, so this
 * UI gate adapts to config changes without a redeploy. Server-side
 * validation re-checks the same RPC on submit; client-side prop is the
 * UX layer, not the enforcement.
 *
 * The acknowledgment checkbox label dynamically interpolates the selected
 * state + the current excluded-states list (same source as the gate). The
 * checkbox value carries the moment-of-affirmation timestamp captured at
 * check-time, which the signUp action persists into user_metadata for the
 * Phase 2 Task 11 trigger to propagate into customers.excluded_state_-
 * acknowledgment_at (per regulatory-posture.md § 3.1). Changing the
 * business_state resets the acknowledgment — re-affirmation required so
 * the saved timestamp matches the state actually submitted.
 *
 * SPOTLIGHT overlay (visual only): native <select> restyled to Spotlight
 * Input primitive (h-11, rounded-lg, bg-card, accent focus ring).
 */
export function SignupGate({ excludedStates }: { excludedStates: string[] }) {
  const [businessState, setBusinessState] = useState<string>("");
  // ISO timestamp captured when the user checks the acknowledgment box;
  // null when unchecked OR when business_state changes (re-affirmation
  // required so the timestamp matches the actually-submitted state).
  const [acknowledgedAt, setAcknowledgedAt] = useState<string | null>(null);

  // Reset acknowledgment whenever business_state changes — the
  // representation is "I confirm my business is located in [STATE] AND
  // I'm not operating in [excluded list]." Changing STATE means the
  // affirmation is no longer about the same target.
  useEffect(() => {
    setAcknowledgedAt(null);
  }, [businessState]);

  const isExcluded = businessState && excludedStates.includes(businessState);
  const isValid = businessState && !isExcluded;

  // Render the dynamic excluded-states list as "CA, WA, TX, VT, OR, NE, or NC"
  // with an Oxford-comma "or" before the last entry.
  const excludedStatesLabel = formatExcludedList(excludedStates);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="business_state">Where is your business located?</Label>
        <select
          id="business_state"
          name="business_state_picker"
          value={businessState}
          onChange={(e) => setBusinessState(e.target.value)}
          className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 py-2 text-[15px] tracking-[-0.005em] text-foreground transition-colors hover:border-surface-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--color-accent-ring)]"
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
          <label className="flex items-start gap-3 rounded-lg border border-input bg-card p-3 text-sm cursor-pointer transition-colors hover:bg-surface-2">
            <input
              type="checkbox"
              name="excluded_state_acknowledgment"
              checked={acknowledgedAt !== null}
              onChange={(e) =>
                setAcknowledgedAt(e.target.checked ? new Date().toISOString() : null)
              }
              className="mt-0.5 h-4 w-4 accent-[color:var(--color-accent)]"
            />
            <span className="text-foreground">
              I confirm my business is located in{" "}
              <span className="font-medium">{getStateName(businessState)}</span>{" "}
              and I am not operating in {excludedStatesLabel}.
            </span>
          </label>

          <GoogleButton
            next="/state-selection"
            businessState={businessState}
            disabled={!acknowledgedAt}
          />
          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-input" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>
          <SignupForm businessState={businessState} acknowledgedAt={acknowledgedAt} />
        </>
      )}
    </div>
  );
}

/**
 * Format the excluded-states list as a comma-separated phrase ending with
 * "or" (Oxford-comma style). Used inside the explicit representation label
 * the customer affirms at signup.
 *
 *   [] → "any excluded state"  (defensive; RPC failure should refuse the page)
 *   [CA] → "CA"
 *   [CA, WA] → "CA or WA"
 *   [CA, WA, TX] → "CA, WA, or TX"
 *   [CA, WA, TX, VT, OR, NE, NC] → "CA, WA, TX, VT, OR, NE, or NC"
 */
function formatExcludedList(codes: string[]): string {
  if (codes.length === 0) return "any excluded state";
  if (codes.length === 1) return codes[0];
  if (codes.length === 2) return `${codes[0]} or ${codes[1]}`;
  return `${codes.slice(0, -1).join(", ")}, or ${codes[codes.length - 1]}`;
}
