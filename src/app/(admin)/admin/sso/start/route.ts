import { type NextRequest, NextResponse } from "next/server";
import { writeAdminAudit } from "@/lib/admin-audit";
import { setAdminSessionCookie } from "@/lib/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { SsoVerifyError, verifyHqSsoToken } from "@/lib/sso/verify";

export const dynamic = "force-dynamic";

/**
 * GET /admin/sso/start?token=<HQ-signed JWT>
 *
 * Entry point for HQ → Foretab /admin handoff. Verifies the HQ-issued
 * SSO token, then either:
 *   - intent='operator_sso' → mints the foretab_admin_session cookie,
 *     writes foretab_admin_audit ('sso_completed'), redirects to the
 *     token's destination_path (must start with /admin)
 *   - intent='impersonate' → calls Supabase auth.admin.generateLink for
 *     the target customer, writes audit ('impersonate_started'),
 *     redirects to the magic action_link (Supabase Auth processes it
 *     and sets the customer session cookie, then redirects to / where
 *     Britt sees the customer's dashboard)
 *
 * Both branches stamp jti on the audit row so reviewers can join
 * foretab_admin_audit ↔ hq_audit_log for the full SSO timeline.
 */
const TENANT_SLUG = "foretab";

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return ssoErrorResponse("Missing token query param. Reach /admin via HQ.", 400);
  }

  let claims: Awaited<ReturnType<typeof verifyHqSsoToken>>;
  try {
    claims = await verifyHqSsoToken(token, TENANT_SLUG);
  } catch (e) {
    if (e instanceof SsoVerifyError) {
      return ssoErrorResponse(e.message, 401);
    }
    return ssoErrorResponse(
      `unexpected SSO verification error: ${e instanceof Error ? e.message : String(e)}`,
      500,
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    undefined;
  const userAgent = request.headers.get("user-agent") ?? undefined;

  if (claims.intent === "operator_sso") {
    await setAdminSessionCookie({
      operatorId: claims.sub,
      operatorEmail: claims.operator_email,
      originJti: claims.jti,
    });
    await writeAdminAudit({
      operatorExternalId: claims.sub,
      operatorEmail: claims.operator_email,
      action: "sso_completed",
      targetKind: "admin_session",
      targetId: null,
      after: {
        destination_path: claims.destination_path,
      },
      jti: claims.jti,
      ip,
      userAgent,
    });

    return NextResponse.redirect(new URL(claims.destination_path, request.url));
  }

  // intent === "impersonate"
  const targetUserId = claims.impersonate_target_user_id;
  if (!targetUserId) {
    return ssoErrorResponse("impersonate intent missing target id", 400);
  }

  // Look up the customer's email. We use Supabase admin API to read
  // auth.users — service-role only.
  const admin = createAdminClient();
  const { data: targetUser, error: getUserError } = await admin.auth.admin.getUserById(targetUserId);
  if (getUserError || !targetUser?.user?.email) {
    return ssoErrorResponse(
      `target user ${targetUserId} not found or has no email: ${getUserError?.message ?? "no email"}`,
      404,
    );
  }

  // Generate a magic link for the customer's email. NOTE: generateLink
  // does NOT send an email — it just produces the action_link that
  // performs the auth + session-cookie set when navigated. Browser is
  // then redirected to / (customer dashboard) with a fresh Supabase Auth
  // customer session set.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: targetUser.user.email,
    options: {
      redirectTo: new URL("/", request.url).toString(),
    },
  });
  if (linkError || !linkData?.properties?.action_link) {
    return ssoErrorResponse(
      `failed to generate impersonation link: ${linkError?.message ?? "no action_link returned"}`,
      500,
    );
  }

  await writeAdminAudit({
    operatorExternalId: claims.sub,
    operatorEmail: claims.operator_email,
    action: "impersonate_started",
    targetKind: "customer",
    targetId: targetUserId,
    after: {
      customer_email: targetUser.user.email,
    },
    jti: claims.jti,
    ip,
    userAgent,
  });

  // Setting the admin session cookie too — operator can come back to
  // /admin after impersonation in another tab without re-SSO'ing.
  await setAdminSessionCookie({
    operatorId: claims.sub,
    operatorEmail: claims.operator_email,
    originJti: claims.jti,
  });

  return NextResponse.redirect(linkData.properties.action_link);
}

function ssoErrorResponse(message: string, status: number): NextResponse {
  // Plain text — these errors are diagnostic, not user-facing. Operators
  // see them; customers never reach /admin/sso/start.
  return new NextResponse(`SSO error: ${message}`, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
