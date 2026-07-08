"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getExcludedBusinessStates } from "@/lib/excluded-states";
import { logGateRejection } from "@/lib/gate-rejections";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/utils";

export type FinishSignupResult = { ok: true } | { ok: false; error: string };

/**
 * Server action for /auth/finish-signup — collects the consent timestamps
 * and business_state that Google OAuth signups miss when they skip /signup.
 *
 * Auth + customer-row read use the user client. The UPDATE uses the admin
 * client because excluded_state_acknowledgment_at / trial_cap_disclosure_at /
 * arbitration_optout_disclosure_at are legal-evidence columns that are
 * service-role-write-only by design (same as the auth/callback handler).
 *
 * Excluded-state gate is enforced server-side here — same as state_selection.
 * Consent timestamps are only written if the columns are currently NULL
 * (idempotent: a returning user who re-lands here can't overwrite evidence).
 */
export async function finishSignup(formData: FormData): Promise<FinishSignupResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const nextRaw = String(formData.get("next") ?? "");
  const nextPath = safeNextPath(nextRaw || "/state-selection");

  const businessStateRaw = String(formData.get("business_state") ?? "")
    .trim()
    .toUpperCase();
  if (!businessStateRaw || businessStateRaw.length !== 2 || !/^[A-Z]{2}$/.test(businessStateRaw)) {
    return { ok: false, error: "Pick your business state to continue." };
  }

  const admin = createAdminClient();
  const { data: customer } = await admin
    .from("customers")
    .select("id, trial_cap_disclosure_at, excluded_state_acknowledgment_at, business_state")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!customer) {
    return { ok: false, error: "Customer profile not yet provisioned. Try again in a moment." };
  }

  // LOAD-BEARING LEGAL GATE: validate against current excluded list.
  const excluded = await getExcludedBusinessStates();
  if (excluded.includes(businessStateRaw)) {
    await logGateRejection({
      declaredState: businessStateRaw,
      gate: "finish_signup",
      authUserId: user.id,
      customerId: customer.id,
    });
    return {
      ok: false,
      error:
        "Foretab doesn't currently operate in that state. Email hi@foretab.com to be notified when we expand.",
    };
  }

  const needsConsent = !customer.trial_cap_disclosure_at;

  // Validate consent timestamps if required.
  const acknowledgedAtRaw = String(formData.get("excluded_state_acknowledgment_at") ?? "");
  const termsAcceptedAtRaw = String(formData.get("terms_accepted_at") ?? "");

  let acknowledgedAt: string | null = null;
  let termsAcceptedAt: string | null = null;
  if (acknowledgedAtRaw && !Number.isNaN(Date.parse(acknowledgedAtRaw))) {
    acknowledgedAt = new Date(Date.parse(acknowledgedAtRaw)).toISOString();
  }
  if (termsAcceptedAtRaw && !Number.isNaN(Date.parse(termsAcceptedAtRaw))) {
    termsAcceptedAt = new Date(Date.parse(termsAcceptedAtRaw)).toISOString();
  }

  if (needsConsent && (!acknowledgedAt || !termsAcceptedAt)) {
    return { ok: false, error: "Please check both acknowledgment boxes to continue." };
  }

  const updates: Record<string, string> = { business_state: businessStateRaw };
  if (needsConsent && acknowledgedAt && !customer.excluded_state_acknowledgment_at) {
    updates.excluded_state_acknowledgment_at = acknowledgedAt;
  }
  if (needsConsent && termsAcceptedAt) {
    updates.trial_cap_disclosure_at = termsAcceptedAt;
    updates.arbitration_optout_disclosure_at = termsAcceptedAt;
  }

  const { error } = await admin.from("customers").update(updates).eq("id", customer.id);
  if (error) {
    return { ok: false, error: `Failed to save: ${error.message}` };
  }

  revalidatePath("/", "layout");
  redirect(nextPath);
}
