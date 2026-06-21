export default function PipelineLoading() {
  return (
    <div className="-m-4 h-[calc(100%+2rem)] animate-pulse">
      <div className="mx-auto max-w-screen-xl space-y-6 px-5 py-6 lg:px-8 lg:py-8">
        {/* Heading */}
        <div className="space-y-2">
          <div className="h-7 w-28 rounded-md bg-surface-3" />
          <div className="h-4 w-64 rounded bg-surface-2" />
        </div>

        {/* KPI strip — 4 tiles */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 h-3 w-16 rounded bg-surface-2" />
              <div className="h-7 w-12 rounded bg-surface-3" />
            </div>
          ))}
        </div>

        {/* 3-up Insights charts — 1.5fr / 1fr / 1.2fr proportions */}
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[1.5fr_1fr_1.2fr]">
          {/* Funnel */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 h-4 w-24 rounded bg-surface-2" />
            <div className="flex items-end gap-2" style={{ height: 140 }}>
              {[90, 68, 50, 32].map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-surface-3" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>

          {/* Win rate */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 h-4 w-28 rounded bg-surface-2" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between">
                    <div className="h-3 w-16 rounded bg-surface-2" />
                    <div className="h-3 w-8 rounded bg-surface-2" />
                  </div>
                  <div className="h-2 w-full rounded-full bg-surface-2">
                    <div className="h-2 rounded-full bg-surface-3" style={{ width: `${[65, 45, 20][i]}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 30-day activity */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 h-4 w-24 rounded bg-surface-2" />
            <div className="flex items-end gap-px" style={{ height: 100 }}>
              {Array.from({ length: 30 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-surface-3"
                  style={{ height: `${20 + ((i * 7) % 60)}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
