"use client";

import { useRouter } from "next/navigation";

/**
 * Section-level degraded state — shown when a query times out or fails.
 * Renders inside the failed section's slot so the rest of the page stays up.
 * Retry triggers router.refresh() which re-runs all server queries.
 *
 * Set showRetry={false} for permanent/quota errors where retrying immediately
 * won't help (e.g. daily quota exhausted).
 */
export function SectionDegraded({
  message,
  showRetry = true,
}: {
  message: string;
  showRetry?: boolean;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-6 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {showRetry ? (
        <button
          type="button"
          onClick={() => router.refresh()}
          className="text-sm font-medium text-primary hover:underline"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
