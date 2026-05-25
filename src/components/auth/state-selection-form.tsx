"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { selectTrialState } from "@/lib/actions/trial";

type StateOption = {
  id: string;
  state_code: string;
  authority_name: string | null;
  refresh_frequency: string | null;
};

export function StateSelectionForm({ states }: { states: StateOption[] }) {
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        setError(null);
        if (!selected) {
          setError("Pick a state to continue.");
          return;
        }
        formData.set("state_id", selected);
        startTransition(async () => {
          const result = await selectTrialState(formData);
          if (result && !result.ok) setError(result.error);
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label>Choose your trial state</Label>
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
                checked={selected === s.id}
                onChange={() => setSelected(s.id)}
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
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={pending || !selected}>
        {pending ? "Starting trial..." : "Start 7-day trial"}
      </Button>
    </form>
  );
}
