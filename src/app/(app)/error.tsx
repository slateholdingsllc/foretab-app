"use client";

/**
 * App-level error boundary — catches genuine render errors in the (app)
 * route segment. Query-level failures are handled per-section in page.tsx
 * via Promise.allSettled; this page is the last resort for render bugs.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-lg font-semibold text-foreground">
        Something went wrong
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {error.message ?? "An unexpected error occurred. Please try again."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
