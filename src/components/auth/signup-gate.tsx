"use client";

import { useEffect, useState } from "react";
import { GoogleButton } from "@/components/auth/google-button";
import { SignupForm } from "@/components/auth/signup-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { US_STATES_AND_DC, getStateName } from "@/lib/constants";

/**
 * SignupGate manages the business_state field, the counsel §3 excluded-state
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
 * Checkbox 1 — counsel §3 two-part representation (updated 2026-06-11):
 *   (a) org NOT formed/organized in, no principal place of business in,
 *       and does not primarily operate from the excluded states.
 *       Majority-of-revenues prong removed per counsel's final §3.
 *   (b) use covenant: no personal-info access/export for those states
 *       without express written authorization.
 *   State list dynamic from excluded_business_states() RPC; renders as
 *   full names (California, not CA) per counsel's copy requirement.
 *
 * Checkbox 2 — R4 Terms/arbitration:
 *   termsAcceptedAt persists to customers.trial_cap_disclosure_at and
 *   customers.arbitration_optout_disclosure_at via handle_email_confirmed.
 *
 * OAuth gap: termsAcceptedAt cannot pass through Supabase's PKCE OAuth
 * redirect. Both R4 columns will be NULL for Google OAuth signups.
 * UI enforcement is the contractual hook; gap flagged per R4 dispatch.
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
          {/* Counsel §3 two-part representation (updated 2026-06-11):
              (a) org not formed/incorporated in, no principal place of business in,
                  and does not primarily operate from the excluded states;
              (b) use covenant — no personal-info access/export for those states
                  without express written authorization.
              NOTE: majority-of-revenues prong from R4 draft has been REMOVED
              per counsel's final §3. State list is dynamic from excluded_business_states() RPC. */}
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
              I represent that my organization is{" "}
              <span className="font-medium">
                not formed or organized in, does not have its principal place of business
                in, and does not primarily operate from
              </span>{" "}
              {formatExcludedListFull(excludedStates)} — and I will not use Foretab to
              access, export, license, or otherwise obtain personal information about
              individuals located in those states unless Foretab expressly authorizes
              that use in writing.
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
            acknowledgedAt={acknowledgedAt}
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
 * Format the excluded-states list using full state names (e.g. "California")
 * — required by counsel §3 representation copy.
 *
 *   [] → "any excluded state"
 *   [CA] → "California"
 *   [CA, WA] → "California or Washington"
 *   [CA, WA, TX, VT, OR] → "California, Washington, Texas, Vermont, or Oregon"
 */
function formatExcludedListFull(codes: string[]): string {
  const names = codes.map((c) => getStateName(c) ?? c);
  if (names.length === 0) return "any excluded state";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;
}
