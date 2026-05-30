import { Resend } from "resend";

/**
 * Signup verification email — durable fix per the 2026-05-30 spec.
 *
 * Replaces Supabase Auth's built-in confirmation email when
 * SIGNUP_FLOW_VERSION=admin_link. We construct the verification link
 * via supabase.auth.admin.generateLink({type: 'signup'}) in the
 * signUp action, then send via Resend with our own template instead
 * of going through the Supabase template → SMTP chain that was the
 * historic source of "verification link is dead" ghost-hunts (Site
 * URL fallback, PKCE prefix template customization drift, Brevo SMTP
 * deliverability, NEXT_PUBLIC_SITE_URL slips).
 *
 * Why this is durable:
 *   - We control the URL (action_link is the literal API-returned
 *     string; no template variable substitution).
 *   - We control the SMTP (Resend — already proven for renewal-
 *     reminder.ts).
 *   - The link's path through Supabase's /auth/v1/verify endpoint
 *     and our /auth/callback route is unchanged — only the SMTP
 *     leg moves to our control.
 *
 * Same shape pattern as lib/email/renewal-reminder.ts.
 */

type SendArgs = {
  recipientEmail: string;
  /**
   * The action_link returned by supabase.auth.admin.generateLink. The
   * link points at <SUPABASE_URL>/auth/v1/verify with the PKCE-prefixed
   * token + redirect_to baked in. We embed it verbatim — never edit,
   * never reconstruct.
   */
  actionLink: string;
};

export async function sendSignupVerification(
  args: SendArgs,
): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY env var not set");
  }
  const resend = new Resend(apiKey);

  const result = await resend.emails.send({
    from: "Foretab <hi@foretab.com>",
    to: args.recipientEmail,
    subject: "Confirm your Foretab account",
    html: renderHtml({ actionLink: args.actionLink }),
    text: renderText({ actionLink: args.actionLink }),
  });

  if (result.error) {
    throw new Error(`Resend send failed: ${result.error.message}`);
  }
  return { id: result.data?.id ?? "" };
}

type TemplateArgs = {
  actionLink: string;
};

function renderHtml(t: TemplateArgs): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1f2328; line-height: 1.6;">
  <p style="margin: 0 0 16px;">Hi,</p>
  <p style="margin: 0 0 16px;">Confirm your Foretab account by clicking the link below. You'll land on a quick state-selection step, then you're in.</p>
  <p style="margin: 0 0 32px;">
    <a href="${t.actionLink}" style="display: inline-block; padding: 12px 24px; background: #2A7BFF; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Confirm your account</a>
  </p>
  <p style="margin: 0 0 16px; color: #6e7781; font-size: 14px;">If the button doesn't work, paste this URL into your browser:</p>
  <p style="margin: 0 0 32px; color: #6e7781; font-size: 13px; word-break: break-all;">${t.actionLink}</p>
  <p style="margin: 0 0 16px; color: #6e7781; font-size: 14px;">If you didn't sign up for Foretab, you can ignore this email.</p>
  <p style="margin: 0; color: #6e7781; font-size: 14px;">— Britt, Foretab</p>
</body>
</html>`;
}

function renderText(t: TemplateArgs): string {
  return `Hi,

Confirm your Foretab account by visiting the link below. You'll land on a quick state-selection step, then you're in.

${t.actionLink}

If you didn't sign up for Foretab, you can ignore this email.

— Britt, Foretab`;
}
