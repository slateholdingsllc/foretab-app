"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isExcludedBusinessState } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

/**
 * Validates a self-declared business state from signup. Required at signup
 * (legal posture: customers must affirm they're not in an excluded state).
 * Returns an error message if invalid or excluded; null if OK.
 *
 * Server-side mirror of the client-side gate in SignupGate. Both layers
 * matter — client gate is the UX; server gate is the enforcement.
 */
function validateBusinessStateForSignup(formData: FormData): string | null {
  const businessState = String(formData.get("business_state") ?? "")
    .trim()
    .toUpperCase();
  if (!businessState) {
    return "Pick your business state to continue.";
  }
  if (businessState.length !== 2) {
    return "Business state must be a 2-letter code.";
  }
  if (isExcludedBusinessState(businessState)) {
    return "Foretab doesn't currently operate in that state. Email hi@foretab.com to be notified when we expand.";
  }
  return null;
}

/**
 * Derive the request's origin from the live request headers, so auth-flow
 * redirects (verification emails, OAuth callbacks, password reset links)
 * route back to whatever URL the user is actually on:
 *
 *   - Production custom domain: https://app.foretab.com
 *   - Production Vercel URL:    https://foretab-app.vercel.app
 *   - Preview deploys:          https://foretab-app-git-<branch>-...vercel.app
 *   - Local dev:                http://localhost:3000
 *
 * NOT derived from NEXT_PUBLIC_SITE_URL — that env var is brittle across
 * environments and was the root cause of the Task 11 OAuth-redirect-to-
 * localhost bug. Header-based origin can't drift relative to where the
 * user actually is.
 */
async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  if (!host) {
    // Server actions always run in a request context, so host should be
    // present. This is just defensive — fall back to whatever the metadata
    // base says (set in src/app/layout.tsx) or production.
    return process.env.NEXT_PUBLIC_SITE_URL || "https://app.foretab.com";
  }
  const protocol = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export type AuthActionResult = { ok: true } | { ok: false; error: string };

export async function signUp(formData: FormData): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const signupSource = String(formData.get("signup_source") ?? "organic");
  const businessState = String(formData.get("business_state") ?? "")
    .trim()
    .toUpperCase();

  if (!email || !password) {
    return { ok: false, error: "Email and password are required." };
  }

  const stateError = validateBusinessStateForSignup(formData);
  if (stateError) return { ok: false, error: stateError };

  const supabase = await createClient();
  const origin = await getRequestOrigin();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Verification link returns here; auth/callback exchanges the code
      // for a session, fires the auth.users trigger, then routes to /state-selection.
      emailRedirectTo: `${origin}/auth/callback?next=/state-selection`,
      // signup_source + business_state flow into auth.users.raw_user_meta_data.
      // business_state is audit-only at this stage (legal: "customer self-
      // declared at signup"); not yet read into the customers row, that's
      // a follow-up if/when storage becomes legally necessary.
      data: { signup_source: signupSource, business_state: businessState },
    },
  });

  if (error) return { ok: false, error: error.message };
  // Redirect to "check your email" screen with the email masked client-side.
  redirect(`/verify-email?email=${encodeURIComponent(email)}`);
}

export async function signIn(formData: FormData): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!email || !password) {
    return { ok: false, error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  redirect(next || "/");
}

export async function signInWithGoogle(formData: FormData): Promise<AuthActionResult> {
  const next = String(formData.get("next") ?? "/");

  // business_state is present when invoked from /signup (SignupGate sets it).
  // Not present on /login (returning user — gate doesn't apply). Validate only
  // when present; absence is OK here. Known edge case: a new user OAuthing
  // from /login bypasses the gate entirely (no customers row gets a state).
  // Acceptable for v1 — back-door enforcement is a follow-up if legal asks.
  const businessStateRaw = String(formData.get("business_state") ?? "").trim();
  if (businessStateRaw) {
    const stateError = validateBusinessStateForSignup(formData);
    if (stateError) return { ok: false, error: stateError };
  }

  const supabase = await createClient();
  const origin = await getRequestOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) return { ok: false, error: error.message };
  if (!data.url) return { ok: false, error: "OAuth provider did not return a redirect URL." };
  redirect(data.url);
}

export async function requestPasswordReset(formData: FormData): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: "Email is required." };

  const supabase = await createClient();
  const origin = await getRequestOrigin();
  // Intentionally don't surface "user not found" — generic success message
  // prevents email enumeration. Supabase silently no-ops for unknown emails.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password/confirm`,
  });
  return { ok: true };
}

export async function updatePassword(formData: FormData): Promise<AuthActionResult> {
  const password = String(formData.get("password") ?? "");
  if (!password) return { ok: false, error: "Password is required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  redirect("/");
}

export async function resendVerification(formData: FormData): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: "Email is required." };

  const supabase = await createClient();
  const origin = await getRequestOrigin();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/state-selection` },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/login");
}
