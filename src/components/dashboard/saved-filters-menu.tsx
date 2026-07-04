"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createSavedFilter,
  deleteSavedFilter,
} from "@/lib/actions/saved-filters";
import {
  hasActiveFilters,
  serializeFiltersToSearchParams,
} from "@/lib/dashboard/filters";
import type { SavedFilter } from "@/lib/dashboard/saved-filters";
import type { FilterState } from "@/lib/dashboard/types";

/**
 * Top-bar saved-filters dropdown. Click the button → opens a panel with:
 *   - "Save current view" inline form (disabled when the URL has no
 *     active filters — saving the default state is rarely what the user
 *     wants)
 *   - List of saved views (defaults first, then alphabetical). Each row:
 *     <Link> applies the view by navigating to "/?<serialized filters>";
 *     × button deletes after a confirm() prompt.
 *
 * URL is the source of truth, so loading a view = a plain navigation, no
 * client state to sync. Save / delete use server actions and revalidate
 * the layout so the menu re-fetches on next render.
 *
 * Click-outside-to-close handled via a ref + document listener; Escape
 * key closes too. No Radix/Headless UI dependency.
 */
export function SavedFiltersMenu({
  savedFilters,
  currentFilters,
}: {
  savedFilters: SavedFilter[];
  currentFilters: FilterState;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtersActive = hasActiveFilters(currentFilters);
  const currentFiltersJson = JSON.stringify(currentFilters);

  const onSave = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await createSavedFilter(formData);
      if (result.ok) {
        setName("");
        setError(null);
      } else {
        setError(result.error);
      }
    });
  };

  const onDelete = (filter: SavedFilter) => (formData: FormData) => {
    const confirmed = window.confirm(
      `Delete saved view "${filter.name}"? This can't be undone.`,
    );
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteSavedFilter(formData);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div ref={rootRef} className="relative" data-tour-id="saved-views">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        Views{savedFilters.length > 0 ? ` (${savedFilters.length})` : ""}
      </Button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-80 rounded-md border border-input bg-popover text-popover-foreground shadow-lg"
        >
          <form action={onSave} className="space-y-2 border-b border-input p-3">
            <input type="hidden" name="filter_config_json" value={currentFiltersJson} />
            <label className="text-xs font-medium text-muted-foreground" htmlFor="saved-filter-name">
              Save current view as
            </label>
            <div className="flex gap-2">
              <Input
                id="saved-filter-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. NY restaurants"
                maxLength={50}
                disabled={!filtersActive || isPending}
              />
              <Button
                type="submit"
                size="sm"
                disabled={!filtersActive || isPending || name.trim().length === 0}
              >
                Save
              </Button>
            </div>
            {!filtersActive ? (
              <p className="text-xs text-muted-foreground">
                Apply some filters before saving a view.
              </p>
            ) : null}
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </form>

          <div className="max-h-72 overflow-y-auto p-1">
            {/* Built-in preset: always visible */}
            <ul className="space-y-0.5 border-b border-input pb-1 mb-1">
              <li className="flex items-center gap-1 rounded-md hover:bg-accent">
                <Link
                  href="/?territory=out"
                  onClick={() => setOpen(false)}
                  className="flex-1 truncate px-2 py-2 text-sm"
                  prefetch={false}
                >
                  Incoming suppliers
                  <span className="ml-2 text-xs text-muted-foreground">preset</span>
                </Link>
              </li>
            </ul>
            {savedFilters.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                No saved views yet.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {savedFilters.map((filter) => {
                  const params = serializeFiltersToSearchParams(filter.filter_config);
                  const href = `/${params.toString() ? `?${params.toString()}` : ""}`;
                  return (
                    <li
                      key={filter.id}
                      className="flex items-center gap-1 rounded-md hover:bg-accent"
                    >
                      <Link
                        href={href}
                        onClick={() => setOpen(false)}
                        className="flex-1 truncate px-2 py-2 text-sm"
                        prefetch={false}
                      >
                        {filter.name}
                        {filter.is_default ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            default
                          </span>
                        ) : null}
                      </Link>
                      <form action={onDelete(filter)}>
                        <input type="hidden" name="id" value={filter.id} />
                        <button
                          type="submit"
                          aria-label={`Delete saved view ${filter.name}`}
                          className="mr-1 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          disabled={isPending}
                        >
                          <span aria-hidden="true">×</span>
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
