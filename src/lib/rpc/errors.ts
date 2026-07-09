/**
 * Typed errors for RPC failure modes. Detect on error.hint (stable across
 * PostgREST versions) rather than error.code or error.message.
 *
 * Quota exceeded:    HTTP 400 { hint: "quota_exceeded" }
 * Not found:         HTTP 400 { hint: "not_found" }
 * Account access:    PostgreSQL 42501 (permission denied) — indicates an
 *                    account-state problem, not a code bug.
 */

export class QuotaExceededError extends Error {
  constructor() {
    super("quota_exceeded");
    this.name = "QuotaExceededError";
  }
}

export class NotFoundError extends Error {
  constructor() {
    super("not_found");
    this.name = "NotFoundError";
  }
}

export class AccountAccessError extends Error {
  constructor() {
    super("account_access_denied");
    this.name = "AccountAccessError";
  }
}

/**
 * Inspect a PostgREST error from an .rpc() call and throw the appropriate
 * typed error. No-ops on unknown hints (caller should throw a generic error).
 */
export function detectRpcError(error: {
  hint?: string | null;
  code?: string | null;
  message?: string;
}): void {
  if (error.hint === "quota_exceeded") throw new QuotaExceededError();
  if (error.hint === "not_found") throw new NotFoundError();
  // PostgreSQL 42501 = permission denied — treat as an account-state problem.
  if (error.code === "42501") throw new AccountAccessError();
}
