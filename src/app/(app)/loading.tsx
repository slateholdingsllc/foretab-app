export default function WorklistLoading() {
  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] animate-pulse grid-cols-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* ── Center column ── */}
      <div className="flex min-h-0 flex-col">
        {/* Sticky tabs row */}
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/95 px-5 py-2.5">
          <div className="h-8 w-48 rounded-md bg-surface-3" />
          <div className="h-8 w-72 rounded-md bg-surface-3" />
        </div>

        {/* Record cards */}
        <div className="flex flex-col gap-2.5 px-5 py-4 lg:py-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="h-9 w-9 shrink-0 rounded-full bg-surface-3" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/5 rounded bg-surface-3" />
                <div className="h-3 w-1/3 rounded bg-surface-2" />
              </div>
              <div className="h-6 w-20 rounded-full bg-surface-3" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Right rail ── */}
      <div className="flex min-h-0 flex-col gap-4 border-t border-border bg-card p-4 lg:border-l lg:border-t-0">
        {/* Today panel skeleton */}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2.5 border-b border-border px-[18px] py-3.5">
            <div className="h-[7px] w-[7px] rounded-full bg-surface-3" />
            <div className="h-4 w-10 rounded bg-surface-3" />
            <div className="ml-auto h-3 w-16 rounded bg-surface-2" />
          </div>
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="h-2 w-2 rounded-full bg-surface-3" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-3/4 rounded bg-surface-3" />
                  <div className="h-2.5 w-1/3 rounded bg-surface-2" />
                </div>
                <div className="h-7 w-14 rounded bg-surface-3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
