"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type BannerEntry = {
  name: string;
  isRed: boolean;
  staleDays: number | null;
  lastRefreshAt: string | null;
};

/**
 * Client shell for DegradedStateBanner. Handles:
 *   - Normal-flow render (scrolls with page, preserves layout space)
 *   - Scroll-activated fixed render: pins at top after the sentinel div
 *     (id="banner-today-sentinel") placed after DispositionTabsBar exits the viewport
 *   - Auto-minimizes to slim one-liner on pin; user can expand manually
 *   - Colors use [[data-theme=light]_&]: overrides (not dark:) so they follow
 *     the app's class-based theme toggle, not OS preference
 */
export function DegradedStateBannerClient({
  entries,
  hasRed,
}: {
  entries: BannerEntry[];
  hasRed: boolean;
}) {
  const [isFixed, setIsFixed] = useState(false);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    const sentinel = document.getElementById("banner-today-sentinel");
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const nowFixed = !entry.isIntersecting;
        setIsFixed(nowFixed);
        if (nowFixed) setMinimized(true);
      },
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Dark is the app default; [[data-theme=light]_&]: overrides for light theme.
  // Using dark: would respond to OS preference, not the app's manual toggle.
  const colorCls = hasRed
    ? "border-red-800/60 bg-red-950 [[data-theme=light]_&]:border-red-300 [[data-theme=light]_&]:bg-red-50"
    : "border-amber-800/60 bg-amber-950 [[data-theme=light]_&]:border-amber-300 [[data-theme=light]_&]:bg-amber-50";

  const iconCls = hasRed
    ? "text-red-400 [[data-theme=light]_&]:text-red-700"
    : "text-amber-400 [[data-theme=light]_&]:text-amber-700";

  const titleCls = hasRed
    ? "text-red-400 [[data-theme=light]_&]:text-red-700"
    : "text-amber-300 [[data-theme=light]_&]:text-amber-800";

  const title = hasRed
    ? "Data refresh is failing for some states"
    : "Data refresh is behind schedule for some states";

  const shortTitle = `Data refresh ${hasRed ? "failing" : "behind"} for ${
    entries.length === 1 ? entries[0].name : `${entries.length} states`
  }`;

  const expandedContent = (
    <div className="flex items-start gap-2">
      <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", iconCls)} />
      <div>
        <p className={cn("text-sm font-semibold", titleCls)}>{title}</p>
        <ul className="mt-1 space-y-0.5">
          {entries.map((e) => (
            <li key={e.name} className="text-sm text-foreground">
              <span className="font-medium">{e.name}</span>
              {" — "}
              {e.lastRefreshAt !== null ? (
                <>
                  last refreshed{" "}
                  <time dateTime={e.lastRefreshAt}>
                    {new Date(e.lastRefreshAt).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                  {e.staleDays !== null && e.staleDays > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({e.staleDays}d ago)
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">no refresh data</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <>
      {/*
       * In-flow instance: always takes up its normal space in the layout.
       * Becomes invisible (but still occupies space) when the fixed copy is
       * active, so removing it from the visual stack doesn't cause a scroll-
       * position jump for content beneath it.
       */}
      <div
        className={cn(
          "-mx-6 mb-4 border-b px-6 py-3",
          colorCls,
          isFixed && "invisible pointer-events-none select-none",
        )}
        aria-hidden={isFixed}
      >
        {expandedContent}
      </div>

      {/* Fixed instance: shown once the TodayPanel sentinel exits the viewport */}
      {isFixed && (
        <div
          className={cn(
            "fixed left-0 right-0 top-0 z-50 border-b px-6 py-3 shadow-md",
            "lg:left-72",
            colorCls,
          )}
          role="alert"
          aria-live="polite"
        >
          {minimized ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className={cn("h-4 w-4 shrink-0", iconCls)} />
                <span className={cn("text-sm font-medium", titleCls)}>
                  {shortTitle}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMinimized(false)}
                className={cn(
                  "rounded p-0.5 transition-colors hover:bg-white/10 [[data-theme=light]_&]:hover:bg-black/5",
                  iconCls,
                )}
                aria-label="Expand data refresh warning"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-4">
              {expandedContent}
              <button
                type="button"
                onClick={() => setMinimized(true)}
                className={cn(
                  "mt-0.5 shrink-0 rounded p-0.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10",
                  iconCls,
                )}
                aria-label="Minimize data refresh warning"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
