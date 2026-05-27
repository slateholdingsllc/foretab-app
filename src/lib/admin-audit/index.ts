import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Foretab tenant-side audit writer for /admin operator actions. Writes
 * to the foretab_admin_audit table (service-role only by RLS — see
 * migration 20260527000001_foretab_admin_audit.sql in foretab-engine).
 *
 * Operator identity is captured from the admin-session cookie, which
 * carries the HQ operator_id + email + origin_jti. The jti ties this
 * row back to the HQ-issued SSO/impersonation token that bootstrapped
 * the session — joinable to hq_audit_log.jti for compliance review.
 *
 * Refuse-on-failure: if the audit write throws, the caller propagates
 * the error. Operator actions that fail to audit must fail completely
 * rather than succeed silently.
 */

export type AdminAuditInput = {
  operatorExternalId: string | null;
  operatorEmail: string | null;
  action: string;
  targetKind?: string | null;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  jti?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export async function writeAdminAudit(input: AdminAuditInput): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("foretab_admin_audit").insert({
    operator_external_id: input.operatorExternalId,
    operator_email: input.operatorEmail,
    action: input.action,
    target_kind: input.targetKind ?? null,
    target_id: input.targetId ?? null,
    before: (input.before ?? null) as Record<string, unknown> | null,
    after: (input.after ?? null) as Record<string, unknown> | null,
    reason: input.reason ?? null,
    jti: input.jti ?? null,
    ip: input.ip ?? null,
    user_agent: input.userAgent ?? null,
  });
  if (error) {
    // Log the full structured error to stderr BEFORE throwing. Vercel
    // runtime logs truncate long thrown error messages — for the Task 21
    // SSO-bootstrap 401 we only saw "[admin-audit] failed..." in the
    // log line, which obscured an env-var misconfiguration. Logging the
    // structured object separately ensures code/message/details/hint are
    // all captured even when the thrown message gets clipped.
    console.error(
      "[admin-audit] insert failed:",
      JSON.stringify(
        {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          action: input.action,
          jti: input.jti,
        },
        null,
        2,
      ),
    );
    throw new Error(`[admin-audit] failed to write audit row: ${error.message}`);
  }
}
