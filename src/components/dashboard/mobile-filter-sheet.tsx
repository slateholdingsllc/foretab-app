"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  hasActiveFilters,
  serializeFiltersToSearchParams,
} from "@/lib/dashboard/filters";
import { SignalMethodologyButton } from "./signal-methodology-button";
import {
  createSavedFilter,
  deleteSavedFilter,
} from "@/lib/actions/saved-filters";
import type { SavedFilter } from "@/lib/dashboard/saved-filters";
import type { FilterState } from "@/lib/dashboard/types";
import {
  ARCHETYPE_OPTIONS,
  DAYS_OPTIONS,
  LICENSE_TYPE_OPTIONS,
  SIGNAL_OPTIONS,
  SORT_OPTIONS,
} from "@/lib/dashboard/filter-options";
import { getStateDisplayLabel } from "@/lib/dashboard/state-display";
import { CityTypeahead } from "./city-typeahead";

/**
 * MobileFilterSheet — the full sidebar FilterForm + SavedFiltersMenu as a
 * thumb-reachable bottom sheet. Mobile-only; the trigger lives in
 * MobileWorklistControls (which is `lg:hidden`).
 *
 * Mirrors FilterForm's model exactly:
 *   - URL params are the source of truth. Local state seeds from `filters`
 *     and only writes to the URL on Apply (multi-selects are tap-chips here
 *     instead of <select multiple>, but the serialized result is identical).
 *   - Cursor is dropped on apply (new filter set = page 1).
 *   - showInactive broadens, so it's not counted by hasActiveFilters but does
 *     gate the Clear affordance.
 *
 * Two panels: "Filters" (the form) and "Views" (save/load via the same
 * server actions as SavedFiltersMenu).
 */
export function MobileFilterSheet({
  open,
  onClose,
  filters,
  accessibleStateCodes,
  savedFilters,
  resultCount,
}: {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  accessibleStateCodes: string[];
  savedFilters: SavedFilter[];
  /** Optional current result count for the Apply button label. */
  resultCount?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<"filters" | "views">("filters");

  // Local draft — seeded from URL-resolved filters, applied on submit.
  const [states, setStates] = useState<string[]>(filters.states);
  const [signals, setSignals] = useState<string[]>(filters.signalStrengths);
  const [types, setTypes] = useState<string[]>(filters.licenseTypes);
  const [archetypes, setArchetypes] = useState<string[]>(filters.businessArchetypes);
  const [days, setDays] = useState<string>(
    filters.daysWindow !== null ? String(filters.daysWindow) : "",
  );
  const [sort, setSort] = useState<string>(filters.sort);
  const [showInactive, setShowInactive] = useState<boolean>(filters.showInactive);
  const [city, setCity] = useState<string>(filters.city);
  const [zip, setZip] = useState<string>(filters.zip);

  // Re-seed when the sheet (re)opens or the URL changes underneath it.
  useEffect(() => {
    if (!open) return;
    setStates(filters.states);
    setSignals(filters.signalStrengths);
    setTypes(filters.licenseTypes);
    setArchetypes(filters.businessArchetypes);
    setDays(filters.daysWindow !== null ? String(filters.daysWindow) : "");
    setSort(filters.sort);
    setShowInactive(filters.showInactive);
    setCity(filters.city);
    setZip(filters.zip);
    setPanel("filters");
  }, [open, filters]);

  // Lock body scroll while open + Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function apply() {
    const next: FilterState = {
      ...filters, // preserves search, dispositionTab, newThisWeek
      states,
      signalStrengths: signals as FilterState["signalStrengths"],
      licenseTypes: types as FilterState["licenseTypes"],
      businessArchetypes: archetypes as FilterState["businessArchetypes"],
      daysWindow: days ? Number.parseInt(days, 10) : null,
      sort: (sort as FilterState["sort"]) ?? "newest_first",
      showInactive,
      city,
      zip,
    };
    const params = serializeFiltersToSearchParams(next);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/?${qs}` : "/");
      onClose();
    });
  }

  function clearAll() {
    setStates([]);
    setSignals([]);
    setTypes([]);
    setArchetypes([]);
    setDays("");
    setSort("newest_first");
    setShowInactive(false);
    setCity("");
    setZip("");
  }

  const draftActive =
    states.length > 0 ||
    signals.length > 0 ||
    types.length > 0 ||
    archetypes.length > 0 ||
    days !== "" ||
    showInactive ||
    city !== "" ||
    zip !== "";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
      {/* scrim */}
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      {/* sheet */}
      <div className="absolute inset-x-0 bottom-0 flex max-h-[90%] flex-col rounded-t-2xl border-t border-border bg-card shadow-lg">
        <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-surface-3" />

        {/* header + panel switch */}
        <div className="flex items-center justify-between border-b border-border px-4 pb-3 pt-2">
          <div className="flex gap-1 rounded-lg bg-secondary p-1">
            <button
              type="button"
              onClick={() => setPanel("filters")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                panel === "filters" ? "bg-card text-foreground shadow-sm" : "text-foreground-muted",
              )}
            >
              Filters
            </button>
            <button
              type="button"
              onClick={() => setPanel("views")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                panel === "views" ? "bg-card text-foreground shadow-sm" : "text-foreground-muted",
              )}
            >
              Views{savedFilters.length > 0 ? ` (${savedFilters.length})` : ""}
            </button>
          </div>
          {panel === "filters" && draftActive ? (
            <button type="button" onClick={clearAll} className="text-sm font-semibold text-primary">
              Clear all
            </button>
          ) : (
            <button type="button" onClick={onClose} className="text-sm font-semibold text-foreground-muted">
              Done
            </button>
          )}
        </div>

        {panel === "filters" ? (
          <>
            <div className="overflow-y-auto px-4 pb-2">
              <ChipGroup label="States">
                {accessibleStateCodes.map((code) => (
                  <Chip key={code} on={states.includes(code)} onClick={() => setStates(toggle(states, code))}>
                    {getStateDisplayLabel(code)}
                  </Chip>
                ))}
              </ChipGroup>

              <div className="border-b border-border py-3.5">
                <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  City
                </div>
                <CityTypeahead
                  value={city}
                  onChange={setCity}
                  selectedStates={states}
                  inputClassName="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--color-accent-ring)] pr-7"
                />
              </div>

              <div className="border-b border-border py-3.5">
                <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  ZIP code
                </div>
                <input
                  type="text"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="e.g. 80203"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--color-accent-ring)]"
                />
              </div>

              <SelectGroup
                label="Date window"
                value={days}
                onChange={setDays}
                options={DAYS_OPTIONS}
              />

              <ChipGroup label="Signal strength" action={<SignalMethodologyButton />}>
                {SIGNAL_OPTIONS.map((o) => (
                  <Chip key={o.value} on={signals.includes(o.value)} onClick={() => setSignals(toggle(signals, o.value))}>
                    {o.label}
                  </Chip>
                ))}
              </ChipGroup>

              <ChipGroup label="License type">
                {LICENSE_TYPE_OPTIONS.map((o) => (
                  <Chip key={o.value} on={types.includes(o.value)} onClick={() => setTypes(toggle(types, o.value))}>
                    {o.label}
                  </Chip>
                ))}
              </ChipGroup>

              <ChipGroup label="Business archetype">
                {ARCHETYPE_OPTIONS.map((o) => (
                  <Chip key={o.value} on={archetypes.includes(o.value)} onClick={() => setArchetypes(toggle(archetypes, o.value))}>
                    {o.label}
                  </Chip>
                ))}
              </ChipGroup>

              <SelectGroup label="Sort" value={sort} onChange={setSort} options={SORT_OPTIONS} />

              <div className="border-b border-border py-3.5">
                <button
                  type="button"
                  onClick={() => setShowInactive((v) => !v)}
                  className="flex w-full items-center gap-3 text-left"
                  aria-pressed={showInactive}
                >
                  <span
                    className={cn(
                      "relative h-6 w-10 shrink-0 rounded-full transition-colors",
                      showInactive ? "bg-primary" : "bg-surface-3",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-card transition-all",
                        showInactive ? "left-[18px]" : "left-0.5",
                      )}
                    />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">Show inactive licenses</span>
                    <span className="block text-xs text-muted-foreground">Revoked, expired, otherwise inactive</span>
                  </span>
                </button>
              </div>
            </div>

            <div className="border-t border-border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <Button type="button" onClick={apply} disabled={pending} className="w-full">
                {pending
                  ? "Applying…"
                  : `Apply filters${typeof resultCount === "number" ? ` · ${resultCount} results` : ""}`}
              </Button>
            </div>
          </>
        ) : (
          <ViewsPanel
            savedFilters={savedFilters}
            currentFilters={filters}
            onApplied={onClose}
            pending={pending}
            startTransition={startTransition}
          />
        )}
      </div>
    </div>
  );
}

/* ── sub-components ── */

function ChipGroup({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border py-3.5">
      <div className="mb-2.5 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
        {action}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-card text-foreground-2 hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

function SelectGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="border-b border-border py-3.5">
      <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--color-accent-ring)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ViewsPanel({
  savedFilters,
  currentFilters,
  onApplied,
  pending,
  startTransition,
}: {
  savedFilters: SavedFilter[];
  currentFilters: FilterState;
  onApplied: () => void;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const filtersActive = hasActiveFilters(currentFilters);
  const currentFiltersJson = JSON.stringify(currentFilters);

  const onSave = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await createSavedFilter(formData);
      if (result.ok) setName("");
      else setError(result.error);
    });
  };

  const onDelete = (filter: SavedFilter) => (formData: FormData) => {
    if (!window.confirm(`Delete saved view "${filter.name}"? This can't be undone.`)) return;
    startTransition(async () => {
      const result = await deleteSavedFilter(formData);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-1">
      <form action={onSave} className="flex flex-col gap-2 border-b border-border py-3.5">
        <input type="hidden" name="filter_config_json" value={currentFiltersJson} />
        <label className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground" htmlFor="m-saved-filter-name">
          Save current view as
        </label>
        <div className="flex gap-2">
          <Input
            id="m-saved-filter-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. NY restaurants"
            maxLength={50}
            disabled={!filtersActive || pending}
          />
          <Button type="submit" size="sm" disabled={!filtersActive || pending || name.trim().length === 0}>
            Save
          </Button>
        </div>
        {!filtersActive ? (
          <p className="text-xs text-muted-foreground">Apply some filters before saving a view.</p>
        ) : null}
        {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
      </form>

      <div className="py-2">
        {savedFilters.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">No saved views yet.</p>
        ) : (
          <ul className="flex flex-col">
            {savedFilters.map((filter) => {
              const params = serializeFiltersToSearchParams(filter.filter_config);
              const href = `/${params.toString() ? `?${params.toString()}` : ""}`;
              return (
                <li key={filter.id} className="flex items-center gap-2 border-b border-border-soft last:border-b-0">
                  <Link
                    href={href}
                    onClick={onApplied}
                    prefetch={false}
                    className="flex-1 truncate py-3 text-[15px] font-semibold text-foreground"
                  >
                    {filter.name}
                    {filter.is_default ? (
                      <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                        default
                      </span>
                    ) : null}
                  </Link>
                  <form action={onDelete(filter)}>
                    <input type="hidden" name="id" value={filter.id} />
                    <button
                      type="submit"
                      aria-label={`Delete saved view ${filter.name}`}
                      disabled={pending}
                      className="rounded p-1.5 text-muted-foreground hover:text-destructive"
                    >
                      <span aria-hidden="true" className="text-lg">×</span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
