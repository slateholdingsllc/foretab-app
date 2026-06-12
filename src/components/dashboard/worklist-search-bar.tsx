"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
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
export function WorklistSearchBar({ filters }: { filters: FilterState }) {
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
    <div className="relative mb-2">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="Search businesses…"
        aria-label="Search businesses"
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          ×
        </button>
      )}
    </div>
  );
}
