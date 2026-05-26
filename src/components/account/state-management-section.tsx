import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStateName } from "@/lib/constants";
import { TIER_DISPLAY_NAMES, TIER_STATE_COUNT, type Tier } from "@/lib/pricing";
import { StatePickerForm } from "./state-picker-form";

type GrantedState = {
  state_id: string;
  granted_via: string;
  states: { state_code: string | null; refresh_frequency: string | null } | null;
};

type SellableState = {
  id: string;
  state_code: string | null;
  refresh_frequency: string | null;
};

/**
 * State management. Behavior per tier:
 *
 *   - single_state: pick exactly 1 state from the sellable catalog.
 *     Customer can swap which state at any time.
 *   - multi_state:  pick up to 5 states.
 *   - all_access:   read-only summary. Every sellable state is granted
 *                   automatically at checkout (see handleCheckoutSessionCompleted).
 *   - no tier (trial-only): show the trial state, no edit form. Direct
 *                   to upgrade for expansion.
 *
 * Tier-limit enforcement is duplicated on the server (updateCustomerStates
 * validates against TIER_STATE_COUNT) — the form-level limit is a UX hint,
 * not the security control.
 */
export function StateManagementSection({
  tier,
  grantedStates,
  sellableStates,
}: {
  tier: Tier | null;
  grantedStates: GrantedState[];
  sellableStates: SellableState[];
}) {
  const sortedSellable = [...sellableStates].sort((a, b) => {
    const an = getStateName(a.state_code ?? "") ?? a.state_code ?? "";
    const bn = getStateName(b.state_code ?? "") ?? b.state_code ?? "";
    return an.localeCompare(bn);
  });

  const grantedIds = new Set(grantedStates.map((g) => g.state_id));
  const grantedDisplay = grantedStates
    .map((g) => ({
      id: g.state_id,
      code: g.states?.state_code ?? null,
      name: getStateName(g.states?.state_code ?? "") ?? g.states?.state_code ?? "Unknown",
      via: g.granted_via,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // -- Trial-only customer --
  if (!tier) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>States</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {grantedDisplay.length > 0 ? (
            <>
              <p className="text-muted-foreground">Your trial state:</p>
              <ul className="space-y-1">
                {grantedDisplay.map((s) => (
                  <li key={s.id} className="font-medium">
                    {s.name} ({s.code})
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground">No states selected yet.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Upgrade to add more states.
          </p>
        </CardContent>
      </Card>
    );
  }

  // -- all_access --
  if (tier === "all_access") {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>States</CardTitle>
          <Badge variant="brand">{grantedDisplay.length} states</Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Your All-Access plan includes every state Foretab currently sells.
            New states are added manually by our team as coverage expands.
          </p>
          {grantedDisplay.length > 0 ? (
            <details className="rounded-md border border-input">
              <summary className="cursor-pointer p-3 text-xs font-medium text-muted-foreground">
                View included states
              </summary>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-input p-3 text-xs sm:grid-cols-3">
                {grantedDisplay.map((s) => (
                  <li key={s.id}>{s.name}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  // -- single_state or multi_state --
  const limit = TIER_STATE_COUNT[tier];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>States</CardTitle>
        <Badge variant="default">
          {grantedDisplay.length} / {limit}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          {tier === "single_state"
            ? "Your Single-state plan covers one state. Pick which one below — you can swap at any time."
            : `Your ${TIER_DISPLAY_NAMES[tier]} plan covers up to ${limit} states.`}
        </p>
        <StatePickerForm
          mode={tier === "single_state" ? "radio" : "checkbox"}
          limit={limit}
          sellableStates={sortedSellable}
          initialSelectedIds={Array.from(grantedIds)}
        />
      </CardContent>
    </Card>
  );
}
