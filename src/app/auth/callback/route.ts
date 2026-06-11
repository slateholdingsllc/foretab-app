import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
 *
 * OAuth disclosure timestamps (R4 gap-close, 2026-06-11):
 *   For Google OAuth signups, the consent timestamps (excluded_state_
 *   acknowledgment_at, trial_cap_disclosure_at, arbitration_optout_
 *   disclosure_at) cannot be passed through raw_user_meta_data — Supabase
 *   signInWithOAuth has no user_metadata pass-through that survives the
 *   PKCE callback. Instead, signInWithGoogle encodes the timestamps as
 *   `acknowledged_at` + `terms_accepted_at` query params in the redirectTo
 *   URL. GoTrue appends `code=` and returns the URL intact, so the params
 *   arrive here. After exchangeCodeForSession (the trigger has already
 *   fired and created the customers row), we UPDATE the NULL columns.
 *   Only affects rows where the columns are NULL — returning users who
 *   already have values are untouched.
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

  // After a successful code exchange the session cookies are set — we can
  // now read the authenticated user.
  const acknowledgedAtParam = searchParams.get("acknowledged_at");
  const termsAcceptedAtParam = searchParams.get("terms_accepted_at");

  if (acknowledgedAtParam || termsAcceptedAtParam) {
    // At least one consent timestamp is present → this is a new Google
    // OAuth signup (login flow never adds these params). Write the
    // timestamps to the customers row the trigger just created.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const updates: Record<string, string> = {};

      if (acknowledgedAtParam && !Number.isNaN(Date.parse(acknowledgedAtParam))) {
        updates.excluded_state_acknowledgment_at = acknowledgedAtParam;
      }
      if (termsAcceptedAtParam && !Number.isNaN(Date.parse(termsAcceptedAtParam))) {
        updates.trial_cap_disclosure_at = termsAcceptedAtParam;
        updates.arbitration_optout_disclosure_at = termsAcceptedAtParam;
      }

      if (Object.keys(updates).length > 0) {
        // Disclosure columns require service-role — they're not in the
        // authenticated role's UPDATE GRANT (intentional: customers can't
        // self-modify legal-evidence columns).
        // WHERE trial_cap_disclosure_at IS NULL: belt-and-suspenders guard
        // so a returning user who re-auths from /signup doesn't overwrite
        // their original evidence timestamps. For brand-new Google signups
        // the trigger sets this to NULL, so the UPDATE always fires.
        const admin = createAdminClient();
        const { error: updateError } = await admin
          .from("customers")
          .update(updates)
          .eq("auth_user_id", user.id)
          .is("trial_cap_disclosure_at", null);

        if (updateError) {
          // Log but don't block the redirect — the session is valid even if
          // the timestamp update fails. The NULL gap is recoverable; a broken
          // redirect is not.
          console.error(
            "[auth/callback] consent timestamp update failed:",
            JSON.stringify({ message: updateError.message }),
          );
        }
      }
    }
  }

  // Successful exchange. Route to the intended destination.
  return NextResponse.redirect(`${origin}${next}`);
}
