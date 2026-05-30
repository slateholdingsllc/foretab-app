"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Client-side finalizer for implicit/OTP-flow auth callbacks
 * (admin.generateLink-issued signup links, password recovery links not
 * using PKCE, etc). The session arrives in the URL hash fragment, which
 * the /auth/callback route handler can't see server-side. This page
 * reads window.location.hash, persists the session via setSession (which
 * writes cookies the SSR middleware can then see), and continues to the
 * `next` destination.
 *
 * PKCE flows never reach this page — they short-circuit in /auth/callback
 * with exchangeCodeForSession and redirect directly to `next`.
 */
export default function AuthFinalizePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function finalize() {
      if (typeof window === "undefined") return;

      const hash = window.location.hash.slice(1);
      if (!hash) {
        setError(
          "Verification link is missing the session payload. Please request a new link from the sign-in page.",
        );
        return;
      }

      const params = new URLSearchParams(hash);

      // Supabase puts errors in the hash too (e.g. expired token).
      const hashError = params.get("error");
      const hashErrorDescription = params.get("error_description");
      if (hashError) {
        setError(hashErrorDescription ?? hashError);
        return;
      }

      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (!access_token || !refresh_token) {
        setError(
          "Verification link is incomplete. Please request a new link from the sign-in page.",
        );
        return;
      }

      const supabase = createClient();
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      if (setSessionError) {
        setError(setSessionError.message);
        return;
      }

      // Clear the hash so the access_token doesn't sit in browser history
      // or get logged by downstream analytics.
      window.history.replaceState(null, "", window.location.pathname);
      router.replace(next);
    }
    void finalize();
  }, [next, router]);

  if (error) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-semibold">Verification problem</h1>
        <p className="mt-2 text-sm text-gray-700">{error}</p>
        <a
          href="/login"
          className="mt-4 inline-block text-sm underline underline-offset-2"
        >
          Back to sign in
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <p className="text-sm text-gray-700">Finishing sign-in…</p>
    </main>
  );
}
