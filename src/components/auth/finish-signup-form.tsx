"use client";

import { useTransition, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { US_STATES_AND_DC, getStateName } from "@/lib/constants";
import { finishSignup } from "@/lib/actions/finish-signup";

/**
 * Client form for /auth/finish-signup. Collects business_state (always)
 * and consent checkboxes (only when needsConsent=true — i.e. the customer
 * row has NULL trial_cap_disclosure_at). Mirrors SignupGate logic and copy
 * exactly so the experience is consistent regardless of entry path.
 */
export function FinishSignupForm({
  next,
  excludedStates,
  needsConsent,
}: {
  next: string;
  excludedStates: string[];
  needsConsent: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [businessState, setBusinessState] = useState("");
  const [acknowledgedAt, setAcknowledgedAt] = useState<string | null>(null);
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isExcluded = businessState && excludedStates.includes(businessState);
  const isValid = businessState && !isExcluded;
  const consentComplete = !needsConsent || !!(acknowledgedAt && termsAcceptedAt);
  const canSubmit = !!isValid && consentComplete;

  function handleStateChange(code: string) {
    setBusinessState(code);
    // Reset consent when state changes — representations reference a specific
    // state; changing it invalidates prior affirmations.
    setAcknowledgedAt(null);
    setTermsAcceptedAt(null);
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    if (acknowledgedAt) formData.set("excluded_state_acknowledgment_at", acknowledgedAt);
    if (termsAcceptedAt) formData.set("terms_accepted_at", termsAcceptedAt);
    startTransition(async () => {
      const result = await finishSignup(formData);
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div className="space-y-2">
        <Label htmlFor="finish_business_state">Where is your business located?</Label>
        <select
          id="finish_business_state"
          name="business_state"
          value={businessState}
          onChange={(e) => handleStateChange(e.target.value)}
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
          We ask up front because Foretab doesn&apos;t currently operate in a handful of states.
        </p>
      )}

      {isExcluded && (
        <Alert>
          <AlertDescription>
            Foretab doesn&apos;t currently operate in {getStateName(businessState)}. If you&apos;d
            like to be notified when we expand, send a note to{" "}
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

      {isValid && needsConsent && (
        <>
          {/* Counsel §3 two-part representation — identical copy to SignupGate */}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-input bg-card p-3 text-sm transition-colors hover:bg-surface-2">
            <input
              type="checkbox"
              checked={acknowledgedAt !== null}
              onChange={(e) =>
                setAcknowledgedAt(e.target.checked ? new Date().toISOString() : null)
              }
              className="mt-0.5 h-4 w-4 accent-[color:var(--color-accent)]"
            />
            <span className="text-foreground">
              I represent that my organization is{" "}
              <span className="font-medium">
                not formed or organized in, does not have its principal place of business in, and
                does not primarily operate from
              </span>{" "}
              {formatExcludedListFull(excludedStates)} — and I will not use Foretab to access,
              export, license, or otherwise obtain personal information about individuals located in
              those states unless Foretab expressly authorizes that use in writing.
            </span>
          </label>

          <p className="text-xs text-muted-foreground">
            Trial accounts can export up to 25 records. Subscribe to remove the cap.
          </p>

          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-input bg-card p-3 text-sm transition-colors hover:bg-surface-2">
              <input
                type="checkbox"
                checked={termsAcceptedAt !== null}
                onChange={(e) =>
                  setTermsAcceptedAt(e.target.checked ? new Date().toISOString() : null)
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
              Section 15 of these Terms contains a binding arbitration agreement and class action
              waiver. You may opt out within 30 days of signup by emailing{" "}
              <a
                href="mailto:hi@foretab.com?subject=Arbitration%20opt-out"
                className="text-primary hover:underline"
              >
                hi@foretab.com
              </a>
              .
            </p>
          </div>
        </>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={!canSubmit || pending}>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}

function formatExcludedListFull(codes: string[]): string {
  const names = codes.map((c) => getStateName(c) ?? c);
  if (names.length === 0) return "any excluded state";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;
}
