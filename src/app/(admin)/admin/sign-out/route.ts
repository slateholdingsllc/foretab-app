import { type NextRequest, NextResponse } from "next/server";
import { writeAdminAudit } from "@/lib/admin-audit";
import { clearAdminSession, getAdminSession } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

/**
 * POST /admin/sign-out — ends the operator session.
 *
 * Captures the session info (for audit) before clearing the cookie,
 * writes a foretab_admin_audit row, then redirects to the
 * operator-session-required message (which the layout renders since the
 * session is now gone).
 */
export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (session) {
    await writeAdminAudit({
      operatorExternalId: session.operator_id,
      operatorEmail: session.operator_email,
      action: "operator_signed_out",
      targetKind: "admin_session",
      targetId: null,
      jti: session.origin_jti,
      ip:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
  }
  await clearAdminSession();
  return NextResponse.redirect(new URL("/admin/dashboard", request.url));
}
