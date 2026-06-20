/**
 * Pipeline loading skeleton — shown instantly while pipeline/page.tsx
 * resolves its auth gate + data queries. Mirrors the AppShell chrome
 * (TopBar, no sidebar) and PipelinePage structure (heading + KPI strip +
 * 3-chart grid) so the transition reads as content arriving, not a flash.
 *
 * Uses -m-4 to escape the (app)/layout's p-4 container, matching what
 * AppShell does. All colors are semantic tokens → works in every theme.
 */
export default function PipelineLoading() {
  return (
    <div className="-m-4 animate-pulse bg-background">
      {/* TopBar skeleton */}
      <div className="flex h-14 items-center gap-3 border-b border-border bg-card px-5">
        <div className="h-7 w-7 rounded-md bg-surface-2" />
        <div className="h-4 w-[72px] rounded bg-surface-2" />
        <div className="h-7 w-40 rounded-md bg-surface-2" />
        <div className="ml-auto flex items-center gap-3">
          <div className="h-4 w-28 rounded bg-surface-2" />
          <div className="h-7 w-16 rounded-md bg-surface-2" />
          <div className="h-7 w-16 rounded-md bg-surface-2" />
        </div>
      </div>

      {/* Page content */}
      <div className="mx-auto max-w-screen-xl space-y-6 px-5 py-6 lg:px-8 lg:py-8">
        {/* Heading */}
        <div className="space-y-2">
          <div className="h-7 w-28 rounded-lg bg-surface-2" />
          <div className="h-4 w-72 rounded bg-surface-2" />
        </div>

        {/* KPI strip — 2-up mobile, 4-up sm+ */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="space-y-2 rounded-xl border border-border bg-card px-3.5 py-3"
            >
              <div className="h-2.5 w-14 rounded bg-surface-2" />
              <div className="h-8 w-16 rounded bg-surface-2" />
            </div>
          ))}
        </div>

        {/* 3-chart grid — same 1.5fr/1fr/1.2fr proportions as the real page */}
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[1.5fr_1fr_1.2fr]">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="space-y-3.5 rounded-lg border border-border bg-card p-4"
            >
              <div className="space-y-1.5">
                <div className="h-4 w-32 rounded bg-surface-2" />
                <div className="h-2.5 w-20 rounded bg-surface-2" />
              </div>
              <div className="h-40 rounded bg-surface-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
