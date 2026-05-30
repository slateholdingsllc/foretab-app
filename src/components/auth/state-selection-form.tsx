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
   * true when neither the customer row nor user_metadata had a
   * business_state — render the "Where is your business?" collector.
   * Post-2026-05-29 signups always have it in metadata, so this is
   * the legacy / edge-case path.
   */
  needsBusinessState: boolean;
  /**
   * Pre-resolved business_state (from customers.business_state OR
   * raw_user_meta_data.business_state). Used to (a) pre-populate the
   * hidden business_state value sent to the action and (b) pre-select
   * the trial radio matching this state if it's in the sellable list.
   */
  initialBusinessState: string | null;
};

export function StateSelectionForm({
  states,
  excludedStates,
  needsBusinessState,
  initialBusinessState,
}: Props) {
  // Pre-select the trial state matching the customer's business state,
  // if it's in the sellable list. Collapses the
  // signup→verify→repick→pick-trial flow into a one-touch confirm.
  // User can still change the radio if they want to evaluate a
  // different state during trial.
  const defaultTrialStateId = initialBusinessState
    ? states.find((s) => s.state_code === initialBusinessState)?.id ?? null
    : null;

  const [error, setError] = useState<string | null>(null);
  const [businessState, setBusinessState] = useState<string>(
    initialBusinessState ?? "",
  );
  const [selectedTrialState, setSelectedTrialState] = useState<string | null>(
    defaultTrialStateId,
  );
  const [pending, startTransition] = useTransition();

  const businessStateExcluded =
    businessState && excludedStates.includes(businessState);
  const businessStateValid = !!businessState && !businessStateExcluded;

  return (
    <form
      action={(formData) => {
        setError(null);
        if (!businessState) {
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
        // Always include business_state — the action persists it to
        // customers.business_state when it differs from the stored value
        // (handles new signups where the trigger-created row has NULL).
        formData.set("business_state", businessState);
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
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
          {defaultTrialStateId && (
            <p className="text-xs text-muted-foreground">
              We've defaulted to your business state — change if you want
              to evaluate a different state during trial.
            </p>
          )}
          <div className="max-h-80 overflow-y-auto rounded-md border border-input divide-y">
            {states.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent"
              >
                <input
                  type="radio"
                  name="state_id_radio"
                  value={s.id}
                  checked={selectedTrialState === s.id}
                  onChange={() => setSelectedTrialState(s.id)}
                  disabled={pending}
                  className="h-4 w-4"
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
