/**
 * Worklist (home) loading skeleton — shown instantly while (app)/page.tsx
 * resolves. Covers both directions: cold load and navigating back from
 * /pipeline. Mirrors AppShell chrome + CockpitBand + worklist grid so the
 * transition reads as content arriving.
 *
 * Uses -m-4 to escape the (app)/layout's p-4 and h-dvh for the full-height
 * worklist layout, matching viewport="full" AppShell behavior.
 */
export default function WorklistLoading() {
  return (
    <div className="-m-4 flex h-dvh animate-pulse flex-col bg-background">
      {/* TopBar skeleton */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-5">
        <div className="h-7 w-7 rounded-md bg-surface-2" />
        <div className="h-4 w-[72px] rounded bg-surface-2" />
        <div className="h-7 w-40 rounded-md bg-surface-2" />
        <div className="ml-auto flex items-center gap-3">
          <div className="h-4 w-28 rounded bg-surface-2" />
          <div className="h-7 w-16 rounded-md bg-surface-2" />
          <div className="h-7 w-16 rounded-md bg-surface-2" />
        </div>
      </div>

      {/* CockpitBand placeholder */}
      <div className="shrink-0 space-y-3.5 border-b border-border bg-surface-2 px-6 py-5">
        {/* Greeting row */}
        <div className="h-6 w-48 rounded-lg bg-surface-3" />
        {/* KPI strip */}
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
        {/* Charts — 1.5fr/1fr/1.2fr */}
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[1.5fr_1fr_1.2fr]">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="space-y-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="space-y-1.5">
                <div className="h-4 w-28 rounded bg-surface-2" />
                <div className="h-2.5 w-18 rounded bg-surface-2" />
              </div>
              <div className="h-28 rounded bg-surface-2" />
            </div>
          ))}
        </div>
      </div>

      {/* Worklist body: sidebar + feed + rail */}
      <div className="flex min-h-0 flex-1">
        {/* Left sidebar */}
        <div className="hidden w-80 shrink-0 border-r border-border bg-card lg:block" />

        {/* Center feed */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Tabs row */}
          <div className="shrink-0 border-b border-border px-5 py-2.5">
            <div className="h-9 w-full max-w-sm rounded-md bg-surface-2" />
          </div>
          {/* Record cards */}
          <div className="flex flex-col gap-2.5 overflow-hidden px-5 py-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-36 rounded-xl border border-border bg-card"
              />
            ))}
          </div>
        </div>

        {/* Right rail */}
        <div className="hidden w-[360px] shrink-0 border-l border-border bg-card lg:block" />
      </div>
    </div>
  );
}
