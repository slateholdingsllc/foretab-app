"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { US_STATES_AND_DC, getStateName } from "@/lib/constants";
import { selectTrialState } from "@/lib/actions/trial";

type TrialStateOption = {
  id: string;
  state_code: string;
  authority_name: string | null;
  refresh_frequency: string | null;
};

type Props = {
  states: TrialStateOption[];
  excludedStates: string[];
  /**
   * true when the customer's customers.business_state is NULL — we need
   * to collect it as part of this submission. false when business_state
   * is already set (re-visit before trial) — skip the collector, only
   * show the trial picker.
   */
  needsBusinessState: boolean;
};

/**
 * SPOTLIGHT overlay (visual only): the native <select>, the trial-state
 * radio list, and its rows are restyled to the Spotlight surface — taller
 * rounded-lg select on bg-card, softer list container, warm surface-2
 * hover. Logic, validation, options, and copy unchanged.
 */
export function StateSelectionForm({
  states,
  excludedStates,
  needsBusinessState,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [businessState, setBusinessState] = useState<string>("");
  const [selectedTrialState, setSelectedTrialState] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const businessStateExcluded =
    needsBusinessState && businessState && excludedStates.includes(businessState);
  const businessStateValid =
    !needsBusinessState || (businessState && !businessStateExcluded);

  return (
    <form
      action={(formData) => {
        setError(null);
        if (needsBusinessState && !businessState) {
          setError("Pick your business state to continue.");
          return;
        }
        if (businessStateExcluded) {
          // Client guard. Server also validates + logs to gate_rejections.
          setError(
            `Foretab doesn't currently operate in ${getStateName(businessState)}.`,
          );
          return;
        }
        if (!selectedTrialState) {
          setError("Pick a state for your trial.");
          return;
        }
        if (needsBusinessState) formData.set("business_state", businessState);
        formData.set("state_id", selectedTrialState);
        startTransition(async () => {
          const result = await selectTrialState(formData);
          if (result && !result.ok) setError(result.error);
        });
      }}
      className="space-y-6"
    >
      {needsBusinessState && (
        <div className="space-y-2">
          <Label htmlFor="business_state">Where is your business located?</Label>
          <select
            id="business_state"
            value={businessState}
            onChange={(e) => setBusinessState(e.target.value)}
            disabled={pending}
            className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 py-2 text-[15px] tracking-[-0.005em] text-foreground transition-colors hover:border-surface-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--color-accent-ring)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Select your state…</option>
            {US_STATES_AND_DC.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
          {businessStateExcluded && (
            <Alert>
              <AlertDescription>
                Foretab doesn't currently operate in {getStateName(businessState)}.
                Email{" "}
                <a
                  href="mailto:hi@foretab.com?subject=Notify%20me%20when%20Foretab%20expands"
                  className="text-primary hover:underline"
                >
                  hi@foretab.com
                </a>{" "}
                to be notified when we expand.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {businessStateValid && (
        <div className="space-y-2">
          <Label>Choose your trial state</Label>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-input divide-y divide-border-soft">
            {states.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-surface-2"
              >
                <input
                  type="radio"
                  name="state_id_radio"
                  value={s.id}
                  checked={selectedTrialState === s.id}
                  onChange={() => setSelectedTrialState(s.id)}
                  disabled={pending}
                  className="h-4 w-4 accent-[color:var(--color-accent)]"
                />
                <div className="flex flex-1 items-center justify-between">
                  <span className="font-medium">{s.state_code}</span>
                  <span className="text-xs text-muted-foreground capitalize">
                    {s.refresh_frequency ?? "—"} refresh
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={
          pending ||
          !businessStateValid ||
          !selectedTrialState ||
          !!businessStateExcluded
        }
      >
        {pending ? "Starting trial..." : "Start 7-day trial"}
      </Button>
    </form>
  );
}
