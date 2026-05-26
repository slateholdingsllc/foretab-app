"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getExcludedBusinessStates } from "@/lib/excluded-states";
import { logGateRejection } from "@/lib/gate-rejections";
import { createClient } from "@/lib/supabase/server";

const TRIAL_LENGTH_DAYS = 7;
// TODO(configurable-not-hardcoded): when public.app_config grows a
// 'trial_length_days' key, move this lookup there. Currently the only
// place trial length lives in app code. See memory:
// configurable-not-hardcoded.

// Default saved views seeded at trial signup. Shape mirrors FilterState
// (see src/lib/dashboard/types.ts) so the Task 16 saved-views menu can
// load them directly. normalizeFilterConfig also accepts the legacy
// snake_case shape — pre-Task-16 trials are still readable.
const DEFAULT_FILTERS = [
  {
    name: "New restaurants this month",
    filter_config: {
      states: [],
      licenseTypes: ["new_issuance"],
      signalStrengths: [],
      businessArchetypes: ["restaurant_full_service", "restaurant_quick_serve"],
      daysWindow: 30,
      sort: "newest_first",
    },
  },
  {
    name: "Hot signal only",
    filter_config: {
      states: [],
      licenseTypes: [],
      signalStrengths: ["hot"],
      businessArchetypes: [],
      daysWindow: null,
      sort: "signal_strength_desc",
    },
  },
  {
    name: "Last 7 days",
    filter_config: {
      states: [],
      licenseTypes: [],
      signalStrengths: [],
      businessArchetypes: [],
      daysWindow: 7,
      sort: "newest_first",
    },
  },
];

export type TrialActionResult = { ok: true } | { ok: false; error: string };

/**
 * /state-selection submission. This action is the LOAD-BEARING LEGAL GATE
 * per regulatory-posture.md — no service delivery (no trial, no
 * customer_states, no default filters) happens unless the customer's
 * business_state is verified non-excluded.
 *
 * Validates business_state against public.excluded_business_states() and
 * writes the value to customers.business_state (durable source of truth).
 * Then proceeds with trial provisioning (the existing flow).
 *
 * If business_state is already set on the customers row from a prior
 * visit, this action re-validates it against the CURRENT excluded list
 * — catches the "excluded list expanded since signup" case.
 */
export async function selectTrialState(formData: FormData): Promise<TrialActionResult> {
  const trialStateId = String(formData.get("state_id") ?? "");
  if (!trialStateId) return { ok: false, error: "Pick a state to continue." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Resolve the customer row created by the auth.users trigger.
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, status, business_state")
    .eq("auth_user_id", user.id)
    .single();

  if (customerError || !customer) {
    return {
      ok: false,
      error: "Customer profile not yet provisioned. Try again in a moment.",
    };
  }

  // Idempotency: if a trial already exists for this customer, skip creation.
  // Prevents double-clicks creating duplicate state grants.
  const { data: existingTrial } = await supabase
    .from("trials")
    .select("id")
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (existingTrial) {
    redirect("/");
  }

  // -----------------------------------------------------------------
  // LOAD-BEARING LEGAL GATE
  // Determine the final business_state to write. Two paths:
  //   1. Customer is submitting it now (form-provided) — validate fresh.
  //   2. Customer's row already has it set from a prior visit — re-
  //      validate against current excluded list (catches "list expanded
  //      since signup").
  // Either path: if business_state is excluded → reject + log + refuse
  // service delivery. Customer location validated before ANY trial,
  // customer_states, or default-filter rows are written.
  // -----------------------------------------------------------------
  const submittedBusinessState = String(formData.get("business_state") ?? "")
    .trim()
    .toUpperCase();

  let finalBusinessState: string | null = customer.business_state ?? null;
  let businessStateSource: "form" | "stored" | "none" = "none";

  if (submittedBusinessState) {
    if (submittedBusinessState.length !== 2) {
      return { ok: false, error: "Business state must be a 2-letter code." };
    }
    finalBusinessState = submittedBusinessState;
    businessStateSource = "form";
  } else if (customer.business_state) {
    finalBusinessState = customer.business_state;
    businessStateSource = "stored";
  }

  if (!finalBusinessState) {
    return { ok: false, error: "Pick your business state to continue." };
  }

  // Validate against current excluded list — server-side enforcement.
  const excluded = await getExcludedBusinessStates();
  if (excluded.includes(finalBusinessState)) {
    await logGateRejection({
      declaredState: finalBusinessState,
      gate: "state_selection",
      authUserId: user.id,
      customerId: customer.id,
    });
    if (businessStateSource === "stored") {
      // Stored business_state is now excluded (list expanded since signup).
      return {
        ok: false,
        error:
          "Foretab doesn't currently operate in your stored business state. Email hi@foretab.com to resolve.",
      };
    }
    return {
      ok: false,
      error:
        "Foretab doesn't currently operate in that state. Email hi@foretab.com to be notified when we expand.",
    };
  }

  // Write business_state durably if it changed (or was newly collected).
  if (finalBusinessState !== customer.business_state) {
    const { error: updateError } = await supabase
      .from("customers")
      .update({ business_state: finalBusinessState })
      .eq("id", customer.id);

    if (updateError) {
      return {
        ok: false,
        error: `Failed to save business state: ${updateError.message}`,
      };
    }
  }

  // -----------------------------------------------------------------
  // Past the gate — proceed with trial provisioning.
  // -----------------------------------------------------------------
  const expiresAt = new Date(
    Date.now() + TRIAL_LENGTH_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Create trial.
  const { data: trial, error: trialError } = await supabase
    .from("trials")
    .insert({
      customer_id: customer.id,
      state_id: trialStateId,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (trialError || !trial) {
    return { ok: false, error: trialError?.message ?? "Failed to create trial." };
  }

  // Grant state access.
  const { error: csError } = await supabase.from("customer_states").insert({
    customer_id: customer.id,
    state_id: trialStateId,
    granted_via: "trial",
    trial_id: trial.id,
  });

  if (csError) {
    return { ok: false, error: csError.message };
  }

  // Seed default saved filters.
  const filterRows = DEFAULT_FILTERS.map((f) => ({
    customer_id: customer.id,
    name: f.name,
    filter_config: f.filter_config,
    is_default: true,
  }));
  await supabase.from("customer_saved_filters").insert(filterRows);
  // Don't fail the trial flow on saved-filter errors — they're nice-to-have.

  revalidatePath("/", "layout");
  redirect("/");
}
