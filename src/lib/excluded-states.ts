import { createClient } from "@/lib/supabase/server";

/**
 * Fetches the current list of US state codes Foretab does not serve
 * customers from. Reads from the foretab-engine config function
 * `public.excluded_business_states()` — populated from a row in
 * `public.app_config` that Britt can update via SQL editor without a
 * redeploy.
 *
 * Per the configurable-not-hardcoded principle: both the /signup
 * dropdown gate and the /state-selection enforcement read this on
 * every request. Updates to the config row propagate immediately.
 *
 * The function is STABLE on the DB side — Postgres caches the call
 * per-statement, so multiple consumers within one request pay the
 * cost once.
 *
 * Failure mode: if the RPC errors (e.g. DB unreachable), we throw.
 * Callers MUST handle — typically by showing an error state and
 * refusing to render the gate. The legal posture is "we cannot
 * proceed without verifying" — better to refuse than to silently
 * default to the empty set (which would let every customer through).
 */
export async function getExcludedBusinessStates(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("excluded_business_states");

  if (error) {
    throw new Error(
      `Could not verify business-state eligibility: ${error.message}`,
    );
  }
  if (!Array.isArray(data)) {
    throw new Error(
      "excluded_business_states RPC returned unexpected shape — expected text[]",
    );
  }
  return data.map((s) => String(s).toUpperCase());
}

/**
 * Convenience: returns true if the given 2-letter code is in the
 * excluded list. Pass through `getExcludedBusinessStates()` rather
 * than calling separately if you've already fetched.
 */
export async function isExcludedBusinessState(code: string): Promise<boolean> {
  const excluded = await getExcludedBusinessStates();
  return excluded.includes(code.toUpperCase());
}
