import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS — use only in server-side
 * code that needs admin access (Vercel Cron handlers, future admin
 * dashboard server actions, etc.).
 *
 * NEVER expose this client to the browser. The service_role JWT can do
 * anything in the database. Vercel env var SUPABASE_SERVICE_ROLE_KEY
 * is intentionally NOT prefixed with NEXT_PUBLIC_, so Next.js won't
 * inline it into the client bundle.
 *
 * Cron handler at /api/cron/subscription-renewal-reminders uses this
 * because it has no user session (Vercel-triggered request, not a
 * customer browser request).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error(
      "createAdminClient requires NEXT_PUBLIC_SUPABASE_URL env var",
    );
  }
  if (!serviceKey) {
    throw new Error(
      "createAdminClient requires SUPABASE_SERVICE_ROLE_KEY env var (server-only, no NEXT_PUBLIC_ prefix)",
    );
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
