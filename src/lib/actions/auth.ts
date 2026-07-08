"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sendSignupVerification } from "@/lib/email/signup-verification";
import { getExcludedBusinessStates } from "@/lib/excluded-states";
import { logGateRejection } from "@/lib/gate-rejections";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Signup flow version flag. Per the durable-fix spec 2026-05-30:
 *   - 'legacy' (default): preserve the existing supabase.auth.signUp call
 *     that uses Supabase's built-in Brevo SMTP + email template.
 *   - 'admin_link': the durable path — admin.createUser +
 *     admin.generateLink + Resend send. We control the full URL +
 *     SMTP chain; nothing on the Supabase template→SMTP→callback
 *     leg can drift.
 *
 * Cutover sequence (see spec §3): merge with default 'legacy' →
 * smoke test on synthetic account with the flag flipped in preview
 * → flip in production → 24h grace for in-flight signups → disable
 * Supabase built-in send in dashboard → 7 days later remove the
 * legacy branch.
 */
type SignupFlowVersion = "legacy" | "admin_link";
function signupFlowVersion(): SignupFlowVersion {
  return process.env.SIGNUP_FLOW_VERSION === "admin_link"
    ? "admin_link"
    : "legacy";
}

/**
 * Sanitize a verification action_link for safe logging. Per the spec's
 * observability decision (§7): redact the token but preserve the
 * structural fingerprint we'd need to diagnose a future recurrence —
 * is the PKCE prefix present, is the redirect_to using the right host,
 * is the verify-endpoint URL pointing at the expected Supabase project.
 *
 * Output shape (one example):
 *   { host: "<project>.supabase.co",
 *     path: "/auth/v1/verify",
 *     token_has_pkce_prefix: true,
 *     token_length: 23,
 *     type: "signup",
 *     redirect_to: "https://app.foretab.com/auth/callback?next=/state-selection" }
 *
 * The token VALUE is NEVER logged. Length + prefix-presence is enough
 * to spot a malformed link without exposing the secret.
 */
function describeActionLinkForLog(actionLink: string): Record<string, unknown> {
  try {
    const url = new URL(actionLink);
    const rawToken = url.searchParams.get("token") ?? "";
    const tokenHasPkcePrefix = rawToken.startsWith("pkce_");
    return {
      host: url.host,
      path: url.pathname,
      token_has_pkce_prefix: tokenHasPkcePrefix,
      token_length: rawToken.length,
      type: url.searchParams.get("type"),
      redirect_to: url.searchParams.get("redirect_to"),
    };
  } catch {
    return { parse_error: true, link_length: actionLink.length };
  }
}

/**
 * Validates a self-declared business state from signup. Required at signup
 * (legal posture: customers must affirm they're not in an excluded state).
 * Returns:
 *   - { ok: true, businessState: "NY" } if valid
 *   - { ok: false, reason: "missing"|"invalid_format"|"excluded", error: string }
 *     if not. Caller logs to gate_rejections only when reason === "excluded".
 *
 * Reads the excluded list from public.excluded_business_states() — same
 * source as the /signup UI gate. Re-validates server-side; client gate is
 * UX-only, not enforcement.
 */
type StateValidationResult =
  | { ok: true; businessState: string }
  | {
      ok: false;
      reason: "missing" | "invalid_format" | "excluded";
      error: string;
      declaredState?: string;
    };

async function validateBusinessStateForSignup(
  formData: FormData,
): Promise<StateValidationResult> {
  const businessState = String(formData.get("business_state") ?? "")
    .trim()
    .toUpperCase();
  if (!businessState) {
    return {
      ok: false,
      reason: "missing",
      error: "Pick your business state to continue.",
    };
  }
  if (businessState.length !== 2) {
    return {
      ok: false,
      reason: "invalid_format",
      error: "Business state must be a 2-letter code.",
      declaredState: businessState,
    };
  }
  const excluded = await getExcludedBusinessStates();
  if (excluded.includes(businessState)) {
    return {
      ok: false,
      reason: "excluded",
      error:
        "Foretab doesn't currently operate in that state. Email hi@foretab.com to be notified when we expand.",
      declaredState: businessState,
    };
  }
  return { ok: true, businessState };
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

  if (!email || !password) {
    return { ok: false, error: "Email and password are required." };
  }

  const stateResult = await validateBusinessStateForSignup(formData);
  if (!stateResult.ok) {
    if (stateResult.reason === "excluded" && stateResult.declaredState) {
      // Audit log for regulatory evidence trail. Best-effort — failure
      // does not block the rejection user-flow.
      await logGateRejection({
        declaredState: stateResult.declaredState,
        gate: "signup",
        // No auth user yet at signup gate — pre-auth context.
      });
    }
    return { ok: false, error: stateResult.error };
  }
  const businessState = stateResult.businessState;

  // Required: explicit excluded-state representation timestamp from
  // SignupGate's acknowledgment checkbox (R1 of the 2026-05-30 dispatch;
  // see regulatory-posture.md § 3.1). Captured at the moment the
  // customer checked the box, NOT at action-invocation time, so the
  // saved evidence matches the moment of affirmation rather than the
  // request-handling moment. The client gate prevents submit until
  // checkbox is checked; this is the server-side belt to catch any
  // bypassed client (e.g. devtools-crafted POST). Validate as ISO 8601;
  // the migration's trigger handles malformed values gracefully (falls
  // through to NULL) but we reject here to enforce the contract at the
  // signup boundary.
  const acknowledgedAtRaw = String(
    formData.get("excluded_state_acknowledgment_at") ?? "",
  ).trim();
  if (!acknowledgedAtRaw) {
    return {
      ok: false,
      error:
        "Please confirm the excluded-state representation to continue.",
    };
  }
  const acknowledgedAtParsed = Date.parse(acknowledgedAtRaw);
  if (Number.isNaN(acknowledgedAtParsed)) {
    return {
      ok: false,
      error: "Acknowledgment timestamp is malformed. Please try again.",
    };
  }

  // R4 (2026-06-11). Terms acceptance timestamp from the Terms checkbox in
  // SignupGate. The server-side handle_email_confirmed trigger fans this
  // single key out to customers.trial_cap_disclosure_at and
  // customers.arbitration_optout_disclosure_at — both disclosures are shown
  // in the same form view, so one timestamp covers both. Belt-and-suspenders
  // server validation mirrors the excluded_state_acknowledgment_at pattern.
  const termsAcceptedAtRaw = String(
    formData.get("terms_accepted_at") ?? "",
  ).trim();
  if (!termsAcceptedAtRaw) {
    return {
      ok: false,
      error: "Please accept the Terms of Service to continue.",
    };
  }
  const termsAcceptedAtParsed = Date.parse(termsAcceptedAtRaw);
  if (Number.isNaN(termsAcceptedAtParsed)) {
    return {
      ok: false,
      error: "Terms acceptance timestamp is malformed. Please try again.",
    };
  }

  const origin = await getRequestOrigin();
  const flow = signupFlowVersion();
  const userMetadata = {
    signup_source: signupSource,
    business_state: businessState,
    excluded_state_acknowledgment_at: new Date(acknowledgedAtParsed).toISOString(),
    terms_accepted_at: new Date(termsAcceptedAtParsed).toISOString(),
  };
  const emailRedirectTo = `${origin}/auth/callback?next=/state-selection`;

  if (flow === "legacy") {
    // PATH A — Supabase's built-in confirmation email. Default until
    // the admin_link path is smoke-tested and the env flag flipped.
    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo, data: userMetadata },
    });
    if (error) return { ok: false, error: error.message };
    redirect(`/verify-email?email=${encodeURIComponent(email)}`);
  }

  // PATH B — admin.createUser + admin.generateLink + Resend send.
  // See spec §2 for the full rationale. Steps:
  //   1. admin.createUser with email_confirm: false → INSERT auth.users
  //      with email_confirmed_at = NULL, metadata populated.
  //   2. admin.generateLink → returns the action_link without sending
  //      any email.
  //   3. sendSignupVerification → Resend with our own template.
  // The post-click chain (Supabase /auth/v1/verify → /auth/callback →
  // exchangeCodeForSession → handle_email_confirmed trigger →
  // /state-selection) is unchanged from the legacy path; only the
  // SMTP leg moves under our control.
  const admin = createAdminClient();

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false, // require verification — the entire point
    user_metadata: userMetadata,
  });
  if (createError) {
    // Don't reveal "user already registered" — same anti-enumeration
    // posture as requestPasswordReset. Map known shapes to a generic
    // try-again message; surface everything else verbatim.
    const message = createError.message ?? "";
    const isAlreadyRegistered =
      /already registered|already exists|duplicate/i.test(message);
    if (isAlreadyRegistered) {
      // Per spec §5 Q1: leave the row, surface a generic message. The
      // /verify-email UI has a Resend button; an already-registered
      // user will see the resend path work for them.
      redirect(`/verify-email?email=${encodeURIComponent(email)}`);
    }
    return { ok: false, error: message };
  }

  const { data: linkData, error: linkError } = await admin.auth.admin
    .generateLink({
      type: "signup",
      email,
      password,
      options: { redirectTo: emailRedirectTo },
    });
  if (linkError) {
    console.error(
      "[signup] admin.generateLink failed:",
      JSON.stringify({
        message: linkError.message,
        email_domain: email.split("@")[1] ?? "(no domain)",
      }),
    );
    return { ok: false, error: "Could not start verification. Try again." };
  }

  const actionLink = linkData?.properties?.action_link;
  if (!actionLink) {
    console.error(
      "[signup] admin.generateLink returned no action_link",
      JSON.stringify({ email_domain: email.split("@")[1] ?? "(no domain)" }),
    );
    return { ok: false, error: "Could not start verification. Try again." };
  }

  // Observability log — per spec §7. Token VALUE never logged; the
  // sanitized fingerprint is enough to diagnose any future "verification
  // link is dead" recurrence at a glance.
  console.log(
    "[signup] admin_link verification URL ready:",
    JSON.stringify(describeActionLinkForLog(actionLink)),
  );

  try {
    await sendSignupVerification({
      recipientEmail: email,
      actionLink,
    });
  } catch (e) {
    console.error(
      "[signup] sendSignupVerification (Resend) failed:",
      JSON.stringify({
        message: e instanceof Error ? e.message : String(e),
        email_domain: email.split("@")[1] ?? "(no domain)",
      }),
    );
    // Per spec §5 Q1: leave the orphan auth.users row. The user lands
    // on /verify-email with a Resend button; the row is harmless and
    // ages out via Supabase's 24h unverified-account TTL if never used.
    return {
      ok: false,
      error: "We couldn't send your verification email. Try again in a moment.",
    };
  }

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
  // from /login bypasses the SIGNUP gate, but they still hit the load-bearing
  // /state-selection gate before any service delivery.
  const businessStateRaw = String(formData.get("business_state") ?? "").trim();
  if (businessStateRaw) {
    const stateResult = await validateBusinessStateForSignup(formData);
    if (!stateResult.ok) {
      if (stateResult.reason === "excluded" && stateResult.declaredState) {
        await logGateRejection({
          declaredState: stateResult.declaredState,
          gate: "signup",
        });
      }
      return { ok: false, error: stateResult.error };
    }
  }

  // Encode consent timestamps in the redirectTo URL so they survive the
  // OAuth round-trip. GoTrue appends `code=` to whatever redirectTo we
  // give it and redirects the browser there after authenticating with
  // Google — our custom params come back intact. /auth/callback reads
  // them after exchangeCodeForSession and writes to the customers row.
  // Only present from /signup (both checkboxes checked); absent on /login.
  const callbackParams = new URLSearchParams({ next });
  const acknowledgedAtRaw = String(
    formData.get("excluded_state_acknowledgment_at") ?? "",
  ).trim();
  if (acknowledgedAtRaw && !Number.isNaN(Date.parse(acknowledgedAtRaw))) {
    callbackParams.set("acknowledged_at", acknowledgedAtRaw);
  }
  const termsAcceptedAtRaw = String(
    formData.get("terms_accepted_at") ?? "",
  ).trim();
  if (termsAcceptedAtRaw && !Number.isNaN(Date.parse(termsAcceptedAtRaw))) {
    callbackParams.set("terms_accepted_at", termsAcceptedAtRaw);
  }

  const supabase = await createClient();
  const origin = await getRequestOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?${callbackParams.toString()}`,
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
  // Defensive normalization: spaces in the local part are structurally
  // a `+` that was URL-decoded somewhere upstream (see page-side note
  // in src/app/(auth)/verify-email/page.tsx). Belt-and-suspenders here
  // so a future caller that mis-encodes can't hand Supabase a malformed
  // email and trigger the silent dead-end this action originally hid.
  const email = String(formData.get("email") ?? "")
    .replace(/ /g, "+")
    .trim()
    .toLowerCase();
  if (!email) return { ok: false, error: "Email is required." };

  // C11: confirmed accounts must not receive a magic-login link via the
  // resend-verification flow. A customers row exists iff the
  // handle_email_confirmed trigger has fired (email_confirmed_at was set).
  // Unverified users have no customers row yet.
  const adminCheck = createAdminClient();
  const { data: existingCustomer } = await adminCheck
    .from("customers")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingCustomer) {
    // Already confirmed — return generic success with no email sent.
    return { ok: true };
  }

  const origin = await getRequestOrigin();
  const emailRedirectTo = `${origin}/auth/callback?next=/state-selection`;
  const flow = signupFlowVersion();

  if (flow === "legacy") {
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  // PATH B — admin.generateLink + Resend handoff. CRITICAL: type must
  // be 'magiclink', NOT 'signup'. admin.generateLink({type:'signup'})
  // is for NEW users only — Supabase rejects it for an existing user
  // (the comment in this block prior to PR #40 incorrectly claimed
  // Supabase ignored the password for an existing-user signup link;
  // it actually rejects the entire call). The resend path runs against
  // users who already exist (unverified-but-created from the original
  // signUp call), so magiclink is the correct variant:
  //   - works for existing users (verified OR unverified)
  //   - when user is unverified, clicking the link also sets
  //     email_confirmed_at (same as signup verify) — exactly the
  //     behavior we want
  //   - produces an OTP-flow URL, same post-click chain as signup:
  //     /auth/v1/verify → /auth/callback → /auth/finalize (PR #34)
  //   - takes no password param (no throwaway needed)
  const admin = createAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin
    .generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: emailRedirectTo },
    });
  if (linkError) {
    console.error(
      "[resendVerification] admin.generateLink failed:",
      JSON.stringify({
        message: linkError.message,
        email_domain: email.split("@")[1] ?? "(no domain)",
      }),
    );
    // Generic message — don't reveal whether the email is in the system.
    return { ok: true };
  }

  const actionLink = linkData?.properties?.action_link;
  if (!actionLink) {
    console.error("[resendVerification] no action_link returned");
    return { ok: true };
  }

  console.log(
    "[resendVerification] admin_link verification URL ready:",
    JSON.stringify(describeActionLinkForLog(actionLink)),
  );

  try {
    await sendSignupVerification({ recipientEmail: email, actionLink });
  } catch (e) {
    console.error(
      "[resendVerification] sendSignupVerification (Resend) failed:",
      JSON.stringify({
        message: e instanceof Error ? e.message : String(e),
      }),
    );
    // Anti-enumeration: surface generic success even on send failure.
    // The user can try again; logs capture the real error.
  }
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/login");
}
