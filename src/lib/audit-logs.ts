import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Defensive audit emit helpers backed by public.audit_logs (engine
 * migration 20260531000001_phase2_audit_logs.sql). Each event_type has
 * a typed wrapper so the metadata schema is one-touch to evolve when a
 * new event lands here.
 *
 * CONTRACT
 * - Every emit is best-effort. A failed insert MUST NOT block the
 *   caller's actual work — a regulator never knew the event happened
 *   is worse than a missing audit row, but a customer's signup blocked
 *   by an audit-table outage is worst of all. All emits are try/catch
 *   wrapped + log to stderr on failure; never throw upward.
 * - Service-role-only writes. audit_logs has RLS enabled with no
 *   policies, so authenticated/anon clients cannot insert; only the
 *   admin client used here can.
 * - Emits run server-side. Never expose this module to the client.
 *
 * See `foretab-engine/docs/regulatory-posture.md` for the broader audit
 * posture this supports.
 */

/**
 * Emitted from /state-selection page render — captures what
 * business_state the page resolved AT EACH RENDER, what it resolved
 * from, and how the resolution interacted with the sellable + excluded
 * lists. Required for "regulator asks why we accepted a customer who
 * appears to operate in [excluded state]" forensics: trace through
 * gate_rejections (signup-time excluded refusals) + audit_logs
 * (state-selection-time resolutions) + customers.business_state
 * (durable customer claim) + trials.state_id (what we sold).
 */
export type StateSelectionResolvedEvent = {
  /** Which source the page used to resolve business_state. */
  resolvedFrom: "customers_table" | "user_metadata" | "none";
  /** The resolved 2-letter state code, or null if both sources empty. */
  resolvedValue: string | null;
  /**
   * true iff the resolved value is present, in the sellable list, AND
   * not in the excluded list — i.e. the trial radio could be
   * pre-selected to match the customer's business state.
   */
  wasPreSelected: boolean;
  /** true iff resolvedValue is in states_active_for_sale. */
  wasInSellableList: boolean;
  /** true iff resolvedValue is in excluded_business_states(). */
  wasInExcludedList: boolean;
};

export async function logStateSelectionResolved(
  userId: string,
  customerId: string | null,
  event: StateSelectionResolvedEvent,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      event_type: "state_selection_resolved",
      user_id: userId,
      customer_id: customerId,
      metadata: {
        resolved_from: event.resolvedFrom,
        resolved_value: event.resolvedValue,
        was_pre_selected: event.wasPreSelected,
        was_in_sellable_list: event.wasInSellableList,
        was_in_excluded_list: event.wasInExcludedList,
      },
    });
    if (error) {
      console.error(
        "[audit-logs] state_selection_resolved insert failed:",
        JSON.stringify({
          message: error.message,
          user_id_present: !!userId,
          customer_id_present: !!customerId,
        }),
      );
    }
  } catch (e) {
    console.error(
      "[audit-logs] state_selection_resolved threw:",
      JSON.stringify({
        message: e instanceof Error ? e.message : String(e),
      }),
    );
  }
}
