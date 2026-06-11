"use client";

import { useEffect, useState } from "react";
import { GoogleButton } from "@/components/auth/google-button";
import { SignupForm } from "@/components/auth/signup-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { US_STATES_AND_DC, getStateName } from "@/lib/constants";

/**
 * SignupGate manages the business_state field, the R1 excluded-state
 * representation, and the R4 disclosures (trial cap + Terms/arbitration).
 * State lives at this level so both SignupForm and GoogleButton pick up
 * the same values — the gate must hold for all signup paths.
 *
 * UI states:
 *   - No state selected: dropdown + hint. Auth options hidden.
 *   - Excluded state: alert + email CTA. Auth options hidden.
 *   - Valid state, checkboxes incomplete: auth options disabled.
 *   - Valid state, both checkboxes checked: auth options enabled.
 *
 * R4 additions (counsel-cleared 2026-06-11):
 *   (a) Acknowledgment checkbox copy updated to three-part representation
 *       (formed in / principal place of business in / majority revenues
 *       from), state list interpolated from the same excluded_business_
 *       states() RPC as before.
 *   (b) 25-record trial export cap disclosure inline, same viewport.
 *   (c) Terms acceptance checkbox with adjacent arbitration opt-out
 *       sentence. termsAcceptedAt persists to customers.trial_cap_
 *       disclosure_at and customers.arbitration_optout_disclosure_at
 *       via the handle_email_confirmed trigger.
 *
 * OAuth gap: termsAcceptedAt cannot be passed through Supabase's PKCE
 * OAuth redirect. Both R4 disclosure columns will be NULL for Google
 * OAuth signups. UI enforcement is the contractual hook; persistence
 * gap flagged per R4 counsel dispatch rather than worked around.
 */
export function SignupGate({ excludedStates }: { excludedStates: string[] }) {
  const [businessState, setBusinessState] = useState<string>("");
  const [acknowledgedAt, setAcknowledgedAt] = useState<string | null>(null);
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null);

  // Reset both checkboxes when state changes — representations reference
  // a specific STATE; changing it invalidates prior affirmations.
  useEffect(() => {
    setAcknowledgedAt(null);
    setTermsAcceptedAt(null);
  }, [businessState]);

  const isExcluded = businessState && excludedStates.includes(businessState);
  const isValid = businessState && !isExcluded;

  const excludedStatesLabel = formatExcludedList(excludedStates);
  const stateName = businessState ? getStateName(businessState) : "";
  const authEnabled = !!(acknowledgedAt && termsAcceptedAt);

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
          {/* R4 (a): three-part representation checkbox */}
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
              I represent that my business was{" "}
              <span className="font-medium">formed in {stateName}</span>, has its{" "}
              <span className="font-medium">
                principal place of business in {stateName}
              </span>
              , and{" "}
              <span className="font-medium">
                derives the majority of its revenues from {stateName}
              </span>{" "}
              — and that I am not operating in {excludedStatesLabel}.
            </span>
          </label>

          {/* R4 (b): 25-record trial export cap — inline, same viewport as CTA */}
          <p className="text-xs text-muted-foreground">
            Trial accounts can export up to 25 records. Subscribe to remove the cap.
          </p>

          {/* R4 (c): Terms acceptance + arbitration opt-out disclosure */}
          <div className="space-y-2">
            <label className="flex items-start gap-3 rounded-lg border border-input bg-card p-3 text-sm cursor-pointer transition-colors hover:bg-surface-2">
              <input
                type="checkbox"
                name="terms_acceptance"
                checked={termsAcceptedAt !== null}
                onChange={(e) =>
                  setTermsAcceptedAt(
                    e.target.checked ? new Date().toISOString() : null,
                  )
                }
                className="mt-0.5 h-4 w-4 accent-[color:var(--color-accent)]"
              />
              <span className="text-foreground">
                I agree to the{" "}
                <a
                  href="https://foretab.com/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Terms of Service
                </a>{" "}
                and{" "}
                <a
                  href="https://foretab.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Privacy Policy
                </a>
                .
              </span>
            </label>
            <p className="text-xs text-muted-foreground px-1">
              Section 15 of these Terms contains a binding arbitration agreement
              and class action waiver. You may opt out within 30 days of signup
              by emailing{" "}
              <a
                href="mailto:hi@foretab.com?subject=Arbitration%20opt-out"
                className="text-primary hover:underline"
              >
                hi@foretab.com
              </a>
              .
            </p>
          </div>

          <GoogleButton
            next="/state-selection"
            businessState={businessState}
            disabled={!authEnabled}
            termsAcceptedAt={termsAcceptedAt}
          />
          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-input" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>
          <SignupForm
            businessState={businessState}
            acknowledgedAt={acknowledgedAt}
            termsAcceptedAt={termsAcceptedAt}
          />
        </>
      )}
    </div>
  );
}

/**
 * Format the excluded-states list as a comma-separated phrase ending with
 * "or" (Oxford-comma style).
 *
 *   [] → "any excluded state"
 *   [CA] → "CA"
 *   [CA, WA] → "CA or WA"
 *   [CA, WA, TX] → "CA, WA, or TX"
 *   [CA, WA, TX, VT, OR] → "CA, WA, TX, VT, or OR"
 */
function formatExcludedList(codes: string[]): string {
  if (codes.length === 0) return "any excluded state";
  if (codes.length === 1) return codes[0];
  if (codes.length === 2) return `${codes[0]} or ${codes[1]}`;
  return `${codes.slice(0, -1).join(", ")}, or ${codes[codes.length - 1]}`;
}
