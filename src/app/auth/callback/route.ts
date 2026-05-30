import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles the return from:
 *   - Email verification link (signup confirmation) — PKCE OR implicit/OTP flow
 *   - Password reset link
 *   - Google OAuth redirect (PKCE)
 *
 * PKCE flows arrive with `?code=...` and are exchanged server-side here.
 *
 * Implicit/OTP flows (e.g. admin.generateLink-issued signup links — the
 * admin endpoint has no client-side PKCE verifier to pair with, so it
 * mints OTP-flow links) arrive with NO `?code=`. The session is in the
 * URL hash fragment (#access_token=...), which servers cannot read. We
 * redirect to /auth/finalize, a client page that reads the hash and
 * calls supabase.auth.setSession to persist it.
 *
 * The auth.users trigger from Phase 2 Task 11 migration 011 creates the
 * customers row when email_confirmed_at is set — that happens at
 * Supabase /auth/v1/verify time, before we reach this handler.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    // Implicit/OTP flow: hand off to the client page so it can read the
    // URL hash fragment. Browsers preserve the hash through this redirect.
    return NextResponse.redirect(
      `${origin}/auth/finalize?next=${encodeURIComponent(next)}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Successful exchange. Route to the intended destination.
  return NextResponse.redirect(`${origin}${next}`);
}
