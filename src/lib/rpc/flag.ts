/**
 * USE_RPC_ENFORCEMENT feature flag.
 *
 * false (default) → direct PostgREST queries (today's behaviour)
 * true            → SECURITY DEFINER RPC calls; direct SELECT on
 *                   classified_records / businesses / locations is
 *                   replaced by the six RPCs from Agent A's Phase 1.
 *
 * Set USE_RPC_ENFORCEMENT=true in the staging .env to run Phase 2
 * integration tests without touching the production direct-SELECT path.
 * Phase 5 REVOKE happens only after a 24h prod-clean confirmation from
 * Agent C; until then the flag is the only gate.
 */
// STAGING TEST BRANCH — flag hardcoded true. NEVER MERGE TO MAIN.
// Revert to: process.env.USE_RPC_ENFORCEMENT === "true"
export const USE_RPC_ENFORCEMENT = true;
