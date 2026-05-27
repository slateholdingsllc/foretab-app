import { importSPKI, jwtVerify } from "jose";

type ImportedKey = Awaited<ReturnType<typeof importSPKI>>;

/**
 * Verifies HQ-issued SSO tokens. Asymmetric verification using HQ's
 * Ed25519 public key (HQ_SSO_PUBLIC_KEY env var, SPKI PEM).
 *
 * The HQ private key never leaves HQ-Slate. If this verifier is
 * compromised, attacker gets the verification key — they CANNOT mint
 * new tokens. Read-only trust direction.
 *
 * Per proposal v0.4 §3.5: SSO tokens are short-lived (60 seconds
 * default at HQ; we accept anything still within its exp). The audience
 * (aud) claim is the tenant slug — we verify it matches expected for
 * this tenant.
 */

const SSO_ALG = "EdDSA";

let cachedPublicKey: ImportedKey | null = null;

async function getPublicKey(): Promise<ImportedKey> {
  if (cachedPublicKey) return cachedPublicKey;

  const pem = process.env.HQ_SSO_PUBLIC_KEY;
  if (!pem) {
    throw new Error(
      "HQ_SSO_PUBLIC_KEY env var is not set. " +
        "HQ generates a keypair via `node scripts/generate-sso-keys.mjs` and " +
        "sets the public PEM here on the tenant's Vercel project.",
    );
  }

  const normalized = pem.replace(/\\n/g, "\n");
  try {
    cachedPublicKey = await importSPKI(normalized, SSO_ALG);
    return cachedPublicKey;
  } catch (e) {
    throw new Error(
      `HQ_SSO_PUBLIC_KEY did not parse as SPKI ${SSO_ALG}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export type VerifiedSsoToken = {
  iss: "hq-slate";
  sub: string; // HQ operator's auth.users.id
  aud: string; // tenant slug
  intent: "operator_sso" | "impersonate";
  destination_path: string;
  operator_email: string;
  impersonate_target_user_id?: string;
  jti: string;
  iat: number;
  exp: number;
};

export class SsoVerifyError extends Error {
  constructor(reason: string) {
    super(`[sso/verify] ${reason}`);
    this.name = "SsoVerifyError";
  }
}

/**
 * Verifies the signature, issuer, audience, expiration, and shape of an
 * HQ-issued SSO token. Returns the verified claims on success; throws
 * SsoVerifyError on any check failure.
 *
 * @param token - the JWT string from the ?token= query param
 * @param expectedTenantSlug - this tenant's slug (e.g. "foretab"). Must
 *                              match the token's aud claim.
 */
export async function verifyHqSsoToken(
  token: string,
  expectedTenantSlug: string,
): Promise<VerifiedSsoToken> {
  const key = await getPublicKey();

  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, key, {
      issuer: "hq-slate",
      audience: expectedTenantSlug,
      algorithms: [SSO_ALG],
    });
    payload = result.payload as Record<string, unknown>;
  } catch (e) {
    throw new SsoVerifyError(
      `signature/issuer/audience/exp check failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const intent = payload.intent;
  if (intent !== "operator_sso" && intent !== "impersonate") {
    throw new SsoVerifyError(`unknown intent: ${String(intent)}`);
  }
  const destination = payload.destination_path;
  if (typeof destination !== "string" || !destination.startsWith("/admin")) {
    throw new SsoVerifyError(
      `destination_path must be a string starting with /admin (got: ${String(destination)})`,
    );
  }
  const sub = payload.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    throw new SsoVerifyError("sub (operator id) missing");
  }
  const email = payload.operator_email;
  if (typeof email !== "string" || email.length === 0) {
    throw new SsoVerifyError("operator_email missing");
  }
  const jti = payload.jti;
  if (typeof jti !== "string" || jti.length === 0) {
    throw new SsoVerifyError("jti missing");
  }
  let impersonateTargetUserId: string | undefined;
  if (intent === "impersonate") {
    const target = payload.impersonate_target_user_id;
    if (typeof target !== "string" || target.length === 0) {
      throw new SsoVerifyError("impersonate intent missing impersonate_target_user_id");
    }
    impersonateTargetUserId = target;
  }

  return {
    iss: "hq-slate",
    sub,
    aud: expectedTenantSlug,
    intent,
    destination_path: destination,
    operator_email: email,
    jti,
    iat: payload.iat as number,
    exp: payload.exp as number,
    ...(impersonateTargetUserId ? { impersonate_target_user_id: impersonateTargetUserId } : {}),
  };
}
