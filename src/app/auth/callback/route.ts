import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles the return from:
 *   - Email verification link (signup confirmation)
 *   - Password reset link
 *   - Google OAuth redirect
 *
 * Exchanges the `code` query param for a session, then routes the user
 * to the `next` param (defaults to /). The auth.users trigger from
 * Phase 2 Task 11 migration 011 creates the customer row at this point
 * (for email/password signup, fires on UPDATE of email_confirmed_at).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
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
