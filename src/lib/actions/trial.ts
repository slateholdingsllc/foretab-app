"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const TRIAL_LENGTH_DAYS = 7;
// TODO(configurable-not-hardcoded): when public.config exists, move this
// to a config-table row keyed 'trial_length_days'. Until then, change
// here. See memory: configurable-not-hardcoded.

const DEFAULT_FILTERS = [
  {
    name: "New restaurants this month",
    filter_config: {
      license_types: ["new_issuance"],
      business_archetypes: ["restaurant_full_service", "restaurant_quick_serve"],
      date_range_days: 30,
      sort_order: "newest_first",
      page_size: 50,
    },
  },
  {
    name: "On-premises licenses (all)",
    filter_config: {
      on_premises: true,
      sort_order: "newest_first",
      page_size: 50,
    },
  },
  {
    name: "Hot signal only",
    filter_config: {
      signal_strength: ["hot"],
      sort_order: "signal_strength_desc",
      page_size: 50,
    },
  },
];

export type TrialActionResult = { ok: true } | { ok: false; error: string };

export async function selectTrialState(formData: FormData): Promise<TrialActionResult> {
  const stateId = String(formData.get("state_id") ?? "");
  if (!stateId) return { ok: false, error: "Pick a state to continue." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Resolve the customer row created by the auth.users trigger.
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, status")
    .eq("auth_user_id", user.id)
    .single();

  if (customerError || !customer) {
    return { ok: false, error: "Customer profile not yet provisioned. Try again in a moment." };
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

  const expiresAt = new Date(Date.now() + TRIAL_LENGTH_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Create trial.
  const { data: trial, error: trialError } = await supabase
    .from("trials")
    .insert({
      customer_id: customer.id,
      state_id: stateId,
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
    state_id: stateId,
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
