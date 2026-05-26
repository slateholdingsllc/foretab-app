"use server";

import { revalidatePath } from "next/cache";
import { normalizeFilterConfig, validateSavedFilterName } from "@/lib/dashboard/saved-filters";
import { createClient } from "@/lib/supabase/server";

export type SavedFilterActionResult = { ok: true } | { ok: false; error: string };

/**
 * Save the current filter state under a customer-provided name. The form
 * passes the FilterState as a JSON string in `filter_config_json` (the
 * client component serializes it from the URL search params before
 * submit). We re-normalize server-side so a tampered form can't smuggle
 * arbitrary jsonb into the row.
 *
 * Uniqueness + 20-cap are DB-enforced:
 *   - UNIQUE(customer_id, name) → conflict → 23505
 *   - enforce_saved_filters_cap() trigger → check_violation → 23514
 * We surface those as user-facing strings rather than letting the raw
 * Postgres error bleed through.
 */
export async function createSavedFilter(
  formData: FormData,
): Promise<SavedFilterActionResult> {
  const nameResult = validateSavedFilterName(formData.get("name"));
  if (!nameResult.ok) return { ok: false, error: nameResult.error };

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("filter_config_json") ?? "{}"));
  } catch {
    return { ok: false, error: "Filter payload was malformed." };
  }
  const filterConfig = normalizeFilterConfig(parsed);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!customer) return { ok: false, error: "Customer profile not found." };

  const { error } = await supabase.from("customer_saved_filters").insert({
    customer_id: customer.id,
    name: nameResult.name,
    filter_config: filterConfig,
    is_default: false,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "You already have a saved view with that name. Pick a different name.",
      };
    }
    if (error.code === "23514" || /20.*saved filters/i.test(error.message)) {
      return {
        ok: false,
        error:
          "You've hit the 20 saved-view limit. Delete an old one to make room.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Delete a saved filter by id. RLS narrows to the customer's own rows so
 * passing someone else's id silently no-ops (no row matches the policy);
 * we don't need an explicit ownership check here.
 *
 * is_default rows are deletable per migration 006's comment ("is_default
 * does not protect rows") — customers can throw out the seeded defaults
 * if they don't find them useful.
 */
export async function deleteSavedFilter(
  formData: FormData,
): Promise<SavedFilterActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing filter id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("customer_saved_filters")
    .delete()
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
