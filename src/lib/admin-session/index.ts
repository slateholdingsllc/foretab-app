import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * Foretab /admin operator session.
 *
 * Distinct from Supabase Auth customer sessions. The /admin operator
 * session is established when /admin/sso/start successfully verifies
 * an HQ-issued SSO token and lasts ~8 hours. Customer-facing pages
 * continue to use Supabase Auth — these two cookie scopes do not
 * interfere.
 *
 * Implementation: HS256 JWT signed with FORETAB_ADMIN_SESSION_SECRET.
 * HS256 is symmetric (only Foretab signs and verifies its own session
 * cookie — no cross-service trust like the SSO token has).
 *
 * Cookie name + scope:
 *   foretab_admin_session   HttpOnly  Secure  SameSite=Lax  Path=/admin
 *
 * Path=/admin means the cookie ONLY accompanies requests to /admin/*.
 * Customer pages (/, /dashboard, etc.) don't receive it. Impersonation
 * is in a different cookie (Supabase Auth customer cookie) and is
 * scoped to /. The two coexist.
 */

const SESSION_COOKIE = "foretab_admin_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours
const SESSION_ALG = "HS256";

export type AdminSessionClaims = {
  /** HQ operator's auth.users.id (passed via SSO token's sub claim). */
  operator_id: string;
  /** Operator email (for audit + UI display). */
  operator_email: string;
  /** SSO token jti that established this session. Audit-chain back to HQ. */
  origin_jti: string;
  iat: number;
  exp: number;
};

function getSecret(): Uint8Array {
  const raw = process.env.FORETAB_ADMIN_SESSION_SECRET;
  if (!raw) {
    throw new Error(
      "FORETAB_ADMIN_SESSION_SECRET env var is not set. " +
        "Generate with `openssl rand -hex 32` (or any 32+ char random string) " +
        "and set on the Foretab Vercel project.",
    );
  }
  if (raw.length < 32) {
    throw new Error(
      "FORETAB_ADMIN_SESSION_SECRET must be at least 32 characters",
    );
  }
  return new TextEncoder().encode(raw);
}

export async function mintAdminSession(args: {
  operatorId: string;
  operatorEmail: string;
  originJti: string;
}): Promise<{ token: string; expiresAtSeconds: number }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_TTL_SECONDS;

  const token = await new SignJWT({
    operator_id: args.operatorId,
    operator_email: args.operatorEmail,
    origin_jti: args.originJti,
  })
    .setProtectedHeader({ alg: SESSION_ALG, typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(getSecret());

  return { token, expiresAtSeconds: exp };
}

export async function setAdminSessionCookie(args: {
  operatorId: string;
  operatorEmail: string;
  originJti: string;
}): Promise<void> {
  const { token, expiresAtSeconds } = await mintAdminSession(args);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    expires: new Date(expiresAtSeconds * 1000),
  });
}

export async function getAdminSession(): Promise<AdminSessionClaims | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  if (!cookie?.value) return null;

  try {
    const { payload } = await jwtVerify(cookie.value, getSecret(), {
      algorithms: [SESSION_ALG],
    });
    return payload as unknown as AdminSessionClaims;
  } catch {
    return null;
  }
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    expires: new Date(0),
  });
}
