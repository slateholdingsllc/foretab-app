"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getExcludedBusinessStates } from "@/lib/excluded-states";
import { logGateRejection } from "@/lib/gate-rejections";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Trial length is now owned by the provision_trial() DB function;
// app code no longer hardcodes it (satisfies configurable-not-hardcoded).

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
    name: "New signal only",
    filter_config: {
      states: [],
      licenseTypes: [],
      signalStrengths: ["New"],
      businessArchetypes: [],
      daysWindow: null,
      sort: "newest_first",
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
 *
 * Auth + read use the user-authenticated client (RLS enforces "own
 * customer row" scoping). The provisioning writes (business_state
 * UPDATE, trials INSERT, customer_states INSERT) use the service-role
 * admin client because per the Phase 2 Task 9 migrations, those tables
 * are service-role-write-only by design — the authenticated grants are
 * SELECT-only. Once the auth check + customer-row resolution + legal
 * gate have all run, the writes are server-side privileged operations,
 * not "user updates own row" — so the trust boundary is the action
 * itself, not the row-level policy.
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
    .select("id, status, business_state, account_type")
    .eq("auth_user_id", user.id)
    .single();

  if (customerError || !customer) {
    return {
      ok: false,
      error: "Customer profile not yet provisioned. Try again in a moment.",
    };
  }

  // Internal accounts bypass state-selection and the geographic gate — they
  // access all sellable states via customer_accessible_state_ids() without
  // a trial. Redirect to the dashboard immediately.
  if (customer.account_type === "internal") {
    redirect("/");
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

  // -----------------------------------------------------------------
  // Past the gate. From here on, writes use the service-role admin
  // client. The authenticated user has SELECT-only grants on trials +
  // customer_states (see migrations 20260524000003 + ...000004); the
  // provisioning row creation is a server-side privileged operation,
  // gated by the auth + legal checks above, not by row-level policy.
  // -----------------------------------------------------------------
  const admin = createAdminClient();

  // Write business_state durably if it changed (or was newly collected).
  if (finalBusinessState !== customer.business_state) {
    const { error: updateError } = await admin
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

  // C6: provision_trial() atomically inserts trials + customer_states.
  // Replaces the sequential INSERT pair; eliminates the window where the
  // trial row exists but customer_states doesn't (a crash between them
  // left the customer with no state access).
  const { error: rpcError } = await admin.rpc("provision_trial", {
    p_customer_id: customer.id,
    p_state_id: trialStateId,
  });

  if (rpcError) {
    const code = rpcError.code;

    if (code === "P0003") {
      // Excluded state — the state is in the geographic exclusion list.
      return {
        ok: false,
        error:
          "Foretab doesn't currently operate in that state. Email hi@foretab.com to be notified when we expand.",
      };
    }
    if (code === "P0004") {
      // Trial already used (prior expired trial) — send to plans.
      redirect("/trial-expired?plans=1");
    }
    if (code === "P0005") {
      // State not currently for sale — re-render picker.
      return {
        ok: false,
        error: "That state isn't currently available. Pick a different state.",
      };
    }
    if (code === "P0006") {
      // Missing business_state on the customers row — route to finish-signup.
      redirect("/auth/finish-signup");
    }
    if (code === "23505") {
      // Concurrent double-click race: another in-flight request already created
      // the trial. Re-read and treat as success if we find the row.
      const { data: raceTrial } = await admin
        .from("trials")
        .select("id")
        .eq("customer_id", customer.id)
        .maybeSingle();
      if (raceTrial) {
        revalidatePath("/", "layout");
        redirect("/");
      }
    }

    return { ok: false, error: rpcError.message };
  }

  // Seed default saved filters (best-effort — don't fail the trial on filter errors).
  const filterRows = DEFAULT_FILTERS.map((f) => ({
    customer_id: customer.id,
    name: f.name,
    filter_config: f.filter_config,
    is_default: true,
  }));
  const { error: filterError } = await admin.from("customer_saved_filters").insert(filterRows);
  if (filterError) {
    console.error(
      "[selectTrialState] Failed to seed default filters — trial active but filters missing:",
      JSON.stringify({ customerId: customer.id, message: filterError.message }),
    );
  }

  revalidatePath("/", "layout");
  redirect("/");
}
