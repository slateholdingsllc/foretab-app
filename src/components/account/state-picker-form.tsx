"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateCustomerStates } from "@/lib/actions/account";
import { getStateName } from "@/lib/constants";

type SellableState = {
  id: string;
  state_code: string | null;
  refresh_frequency: string | null;
};

/**
 * Tier-aware state picker. Modes:
 *   - "radio" (single_state): exactly one state, radio buttons.
 *   - "checkbox" (multi_state): up to `limit`, checkboxes; over-limit
 *     checkboxes are disabled (UX hint — server re-validates).
 *
 * Submit button is disabled when the selection equals the initial state
 * (no change to save) so accidental form submits don't churn the DB.
 *
 * The form submits to updateCustomerStates which validates against
 * TIER_STATE_COUNT[tier] on the server. Inline error surfaces from the
 * action result; success path revalidates /account.
 */
export function StatePickerForm({
  mode,
  limit,
  sellableStates,
  initialSelectedIds,
}: {
  mode: "radio" | "checkbox";
  limit: number;
  sellableStates: SellableState[];
  initialSelectedIds: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialSelectedIds),
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const initial = new Set(initialSelectedIds);
  const hasChanges =
    selected.size !== initial.size ||
    [...selected].some((id) => !initial.has(id));

  const toggle = (id: string) => {
    setSuccess(false);
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (mode === "radio") {
        next.clear();
        next.add(id);
        return next;
      }
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < limit) {
        next.add(id);
      }
      return next;
    });
  };

  const onSubmit = (formData: FormData) => {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateCustomerStates(formData);
      if (result.ok) {
        setSuccess(true);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form action={onSubmit} className="space-y-3">
      <fieldset className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <legend className="sr-only">Pick states</legend>
        {sellableStates.map((s) => {
          const isChecked = selected.has(s.id);
          const disabled =
            !isChecked && mode === "checkbox" && selected.size >= limit;
          const stateName = getStateName(s.state_code ?? "") ?? s.state_code ?? "Unknown";
          return (
            <label
              key={s.id}
              className={`flex cursor-pointer items-center gap-2 rounded-md border border-input p-2 text-sm transition-colors hover:bg-accent ${
                isChecked ? "border-primary/40 bg-primary/5" : ""
              } ${disabled ? "cursor-not-allowed opacity-50 hover:bg-transparent" : ""}`}
            >
              <input
                type={mode === "radio" ? "radio" : "checkbox"}
                name="state_id"
                value={s.id}
                checked={isChecked}
                disabled={disabled}
                onChange={() => toggle(s.id)}
                className="h-4 w-4 shrink-0"
              />
              <span className="flex-1 truncate">
                {stateName}{" "}
                <span className="text-xs text-muted-foreground">
                  ({s.state_code})
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-muted-foreground">
          State access updated. New filters will reflect this on your next
          dashboard refresh.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!hasChanges || isPending || selected.size === 0}>
          {isPending ? "Saving…" : "Save states"}
        </Button>
        {mode === "checkbox" ? (
          <span className="text-xs text-muted-foreground">
            {selected.size} / {limit} selected
          </span>
        ) : null}
      </div>
    </form>
  );
}
