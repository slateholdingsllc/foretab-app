import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

type LogRejectionInput = {
  declaredState: string;
  gate: "signup" | "state_selection";
  authUserId?: string | null;
  customerId?: string | null;
};

/**
 * Append a row to `public.gate_rejections` when a customer attempts to
 * declare an excluded business state. Captures forensic context from
 * request headers (IP via x-forwarded-for, user-agent) for the audit
 * trail.
 *
 * Best-effort: failures are intentionally swallowed. A log-table outage
 * must not break the user-facing rejection flow — the customer should
 * still see the "we don't operate in that state" message even if we
 * couldn't write to the audit log. Errors print to stderr so they show
 * up in Vercel runtime logs.
 */
export async function logGateRejection(input: LogRejectionInput): Promise<void> {
  try {
    const supabase = await createClient();
    const h = await headers();

    // x-forwarded-for can be "client, proxy1, proxy2" — first is original.
    const xff = h.get("x-forwarded-for");
    const ipRaw = xff?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
    const userAgent = h.get("user-agent") ?? null;

    await supabase.from("gate_rejections").insert({
      declared_state: input.declaredState.toUpperCase(),
      gate: input.gate,
      auth_user_id: input.authUserId ?? null,
      customer_id: input.customerId ?? null,
      ip_address: ipRaw,
      user_agent: userAgent,
    });
  } catch (err) {
    console.error("[gate-rejections] Failed to log rejection:", err);
    // Intentionally do not re-throw — logging is best-effort.
  }
}
