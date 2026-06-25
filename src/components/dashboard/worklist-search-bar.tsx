"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { serializeFiltersToSearchParams } from "@/lib/dashboard/filters";
import type { FilterState } from "@/lib/dashboard/types";

/**
 * Debounced search bar for the worklist sticky header. Navigates to a new
 * URL on input, preserving all other active filters. Cursor is dropped on
 * each search change (results reset to page 1).
 *
 * Does NOT use useSearchParams — reads the current search term from the
 * server-resolved FilterState prop so no Suspense boundary is needed.
 */
export function WorklistSearchBar({
  filters,
  className,
}: {
  filters: FilterState;
  className?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [value, setValue] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when back/forward navigation changes the search param externally.
  useEffect(() => {
    setValue(filters.search);
  }, [filters.search]);

  function navigate(term: string) {
    const next: FilterState = { ...filters, search: term.trim() };
    // serializeFiltersToSearchParams omits cursor — navigation resets to page 1.
    const params = serializeFiltersToSearchParams(next);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/?${qs}` : "/");
    });
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setValue(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate(v), 300);
  }

  function handleClear() {
    setValue("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    navigate("");
  }

  return (
    <div className={cn("relative mb-2.5", className)}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-foreground-muted"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </span>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="Search businesses by name…"
        aria-label="Search businesses"
        className="flex h-12 w-full rounded-xl border-[1.5px] border-border bg-card pl-11 pr-10 text-[15px] text-foreground shadow-sm ring-offset-background transition-colors placeholder:text-foreground-muted hover:border-surface-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--color-accent-ring)]"
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-foreground-muted hover:bg-secondary hover:text-foreground"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
