"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getStripe } from "@/lib/stripe/client";
import { TIER_STATE_COUNT } from "@/lib/pricing";
import type { Tier } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AccountActionResult = { ok: true } | { ok: false; error: string };

/**
 * Update which states a customer has access to (within the count limit
 * their current tier permits). Used by /account state-management section.
 *
 * Allowed for tiers single_state (1 state) and multi_state (5 states).
 * all_access is read-only — every sellable state is granted by the
 * checkout webhook (handleCheckoutSessionCompleted → expandCustomerStatesToAllAccess).
 *
 * Updates the customer's state grants in place: deletes subscription-
 * granted rows not in the new selection, inserts new ones. trial-granted
 * rows are left alone — they expire with the trial.
 *
 * RLS posture: customer_states only allows authenticated SELECT (see
 * migration 004). INSERT/DELETE require service_role, so this action
 * uses the admin client AFTER explicitly verifying the caller owns the
 * customer row.
 */
export async function updateCustomerStates(
  formData: FormData,
): Promise<AccountActionResult> {
  const selected = formData
    .getAll("state_id")
    .map((v) => String(v))
    .filter(Boolean);

  if (selected.length === 0) {
    return { ok: false, error: "Pick at least one state." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, current_tier, status")
    .eq("auth_user_id", user.id)
    .single();
  if (customerError || !customer) {
    return { ok: false, error: "Customer profile not found." };
  }

  const tier = customer.current_tier as Tier | null;
  if (!tier) {
    return {
      ok: false,
      error: "No active subscription — state changes apply to paid tiers only.",
    };
  }
  if (tier === "all_access") {
    return {
      ok: false,
      error: "All-Access already includes every available state.",
    };
  }

  const limit = TIER_STATE_COUNT[tier];
  if (selected.length > limit) {
    return {
      ok: false,
      error: `Your ${tier.replace(/_/g, " ")} plan allows up to ${limit} state${limit === 1 ? "" : "s"}.`,
    };
  }
  if (tier === "single_state" && selected.length !== 1) {
    return { ok: false, error: "Single-state plan: pick exactly one state." };
  }

  // Resolve the customer's active subscription so we can attribute the
  // granted_via=subscription rows. Required by the customer_states.granted_via
  // check constraint when subscription_id is set.
  const adminClient = createAdminClient();
  const { data: activeSub } = await adminClient
    .from("subscriptions")
    .select("id")
    .eq("customer_id", customer.id)
    .eq("status", "active")
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!activeSub) {
    return {
      ok: false,
      error: "No active subscription found — refresh and try again.",
    };
  }

  // Validate the picked state_ids are all sellable. Guards against
  // tampered hidden form fields trying to grant access to non-sellable
  // states (e.g. early-access or excluded).
  const { data: sellableRows, error: sellableErr } = await adminClient
    .from("states_active_for_sale")
    .select("id")
    .in("id", selected);
  if (sellableErr) {
    return { ok: false, error: `Could not validate states: ${sellableErr.message}` };
  }
  const sellableIds = new Set((sellableRows ?? []).map((r: { id: string }) => r.id));
  for (const id of selected) {
    if (!sellableIds.has(id)) {
      return {
        ok: false,
        error: "One or more selected states are not currently sellable.",
      };
    }
  }

  // Read existing subscription-granted rows so we can compute the diff.
  // We deliberately ignore trial-granted rows — those expire with the
  // trial and shouldn't be touched here.
  const { data: existingRows } = await adminClient
    .from("customer_states")
    .select("id, state_id, granted_via")
    .eq("customer_id", customer.id);

  const existing = (existingRows ?? []) as Array<{
    id: string;
    state_id: string;
    granted_via: string;
  }>;

  const existingSubStateIds = new Set(
    existing.filter((r) => r.granted_via === "subscription").map((r) => r.state_id),
  );
  const desiredStateIds = new Set(selected);

  const toDelete = existing.filter(
    (r) => r.granted_via === "subscription" && !desiredStateIds.has(r.state_id),
  );
  const toInsert = selected
    .filter((id) => !existingSubStateIds.has(id))
    .map((id) => ({
      customer_id: customer.id,
      state_id: id,
      granted_via: "subscription" as const,
      subscription_id: activeSub.id,
    }));

  if (toDelete.length > 0) {
    const { error: deleteErr } = await adminClient
      .from("customer_states")
      .delete()
      .in(
        "id",
        toDelete.map((r) => r.id),
      );
    if (deleteErr) {
      return { ok: false, error: `Failed to remove states: ${deleteErr.message}` };
    }
  }

  if (toInsert.length > 0) {
    // upsert with ignoreDuplicates so a trial-granted row for the same
    // state doesn't cause an INSERT conflict. The trial row stays as-is;
    // we just don't add a duplicate subscription row.
    const { error: insertErr } = await adminClient
      .from("customer_states")
      .upsert(toInsert, {
        onConflict: "customer_id,state_id",
        ignoreDuplicates: true,
      });
    if (insertErr) {
      return { ok: false, error: `Failed to add states: ${insertErr.message}` };
    }
  }

  revalidatePath("/account");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Open the Stripe Customer Portal with the subscription_cancel flow
 * pre-selected. Terms §10: cancellation does NOT cut access immediately —
 * Stripe sets cancel_at_period_end=true, customer keeps access through
 * current_period_end. Our customer_accessible_state_ids() helper only
 * gates on subscription.status='active', so access is preserved until
 * the subscription transitions to canceled (which the
 * customer.subscription.deleted webhook handles).
 *
 * Refund Policy §3 is a SEPARATE operator-initiated flow — refunds
 * processed via Stripe Dashboard immediately end access on the next
 * webhook tick. Not exposed in this UI.
 */
export async function createCancelPortalSession(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!customer) {
    redirect("/account?error=Customer+profile+not+found.");
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("customer_id", customer.id)
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub?.stripe_customer_id || !sub.stripe_subscription_id) {
    redirect("/account?error=No+subscription+to+cancel.");
  }

  const stripe = getStripe();
  const origin = await getRequestOrigin();
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${origin}/account?cancelled=1`,
    flow_data: {
      type: "subscription_cancel",
      subscription_cancel: { subscription: sub.stripe_subscription_id },
      after_completion: {
        type: "redirect",
        redirect: { return_url: `${origin}/account?cancelled=1` },
      },
    },
  });
  redirect(session.url);
}

async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  if (!host) {
    return process.env.NEXT_PUBLIC_SITE_URL || "https://app.foretab.com";
  }
  const protocol =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
