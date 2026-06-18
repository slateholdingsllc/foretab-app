/**
 * USE_RPC_ENFORCEMENT feature flag — function form guarantees runtime evaluation.
 *
 * A module-level const baked false at build time when the env var was absent
 * during the Vercel build (June 2026 incident: production camera showed direct
 * classified_records reads firing alongside RPC calls despite the flag being set
 * in the Vercel Production scope). Converting to a function ensures process.env
 * is read at Lambda invocation time, not webpack bundle time.
 *
 * false → direct PostgREST queries
 * true  → SECURITY DEFINER RPC calls exclusively; direct SELECT on
 *          classified_records / businesses / locations replaced by Agent A's
 *          Phase 1 RPCs. REVOKE of the authenticated SELECT grant is gated on
 *          the production camera confirming exclusive RPC routing.
 */
export function rpcEnforced(): boolean {
  return process.env.USE_RPC_ENFORCEMENT === "true";
}
