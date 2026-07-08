import { Resend } from "resend";

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

type SendArgs = {
  recipientEmail: string;
  stateCode: string;
  /** ISO timestamp of trial.expires_at */
  expiresAt: string;
};

export async function sendTrialExpiryReminder(args: SendArgs): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY env var not set");
  const resend = new Resend(apiKey);

  const stateName = STATE_NAMES[args.stateCode.toUpperCase()] ?? args.stateCode;
  const expiryDate = new Date(args.expiresAt);
  const expiryDisplay = expiryDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const upgradeUrl = "https://app.foretab.com/trial-expired";

  const result = await resend.emails.send({
    from: "Foretab <hi@foretab.com>",
    to: args.recipientEmail,
    subject: `Your Foretab trial ends tomorrow`,
    html: renderHtml({ stateName, expiryDisplay, upgradeUrl }),
    text: renderText({ stateName, expiryDisplay, upgradeUrl }),
  });

  if (result.error) throw new Error(`Resend send failed: ${result.error.message}`);
  return { id: result.data?.id ?? "" };
}

type TemplateArgs = {
  stateName: string;
  expiryDisplay: string;
  upgradeUrl: string;
};

function renderHtml(t: TemplateArgs): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1f2328; line-height: 1.6;">
  <p style="margin: 0 0 16px;">Hi,</p>
  <p style="margin: 0 0 16px;">Your Foretab trial for <strong>${t.stateName}</strong> ends tomorrow on <strong>${t.expiryDisplay}</strong>.</p>
  <p style="margin: 0 0 16px;">After that, your access to new license applications and issuances will be paused. Your data stays safe — upgrade anytime within 30 days to pick up where you left off.</p>
  <p style="margin: 0 0 32px;">
    <a href="${t.upgradeUrl}" style="display: inline-block; padding: 12px 24px; background: #2A7BFF; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Upgrade to keep access</a>
  </p>
  <p style="margin: 0 0 16px; color: #6e7781; font-size: 14px;">If you have any questions, just reply to this email.</p>
  <p style="margin: 0; color: #6e7781; font-size: 14px;">— Britt, Foretab</p>
</body>
</html>`;
}

function renderText(t: TemplateArgs): string {
  return `Hi,

Your Foretab trial for ${t.stateName} ends tomorrow on ${t.expiryDisplay}.

After that, your access to new license applications and issuances will be paused. Your data stays safe — upgrade anytime within 30 days to pick up where you left off.

Upgrade to keep access: ${t.upgradeUrl}

If you have any questions, just reply to this email.

— Britt, Foretab`;
}
