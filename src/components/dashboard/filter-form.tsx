"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  hasActiveFilters,
  parseFiltersFromSearchParams,
  serializeFiltersToSearchParams,
} from "@/lib/dashboard/filters";
import {
  ARCHETYPE_OPTIONS,
  DAYS_OPTIONS,
  LICENSE_TYPE_OPTIONS,
  SIGNAL_OPTIONS,
  SORT_OPTIONS,
} from "@/lib/dashboard/filter-options";
import type {
  BusinessArchetype,
  FilterState,
  LeadType,
  LicenseRecordType,
  SignalStrength,
} from "@/lib/dashboard/types";
import { CityTypeahead } from "./city-typeahead";
import { SignalMethodologyButton } from "./signal-methodology-button";

/**
 * Filter form. URL search params are the source of truth — form
 * submission navigates to a new URL with updated params, server
 * re-renders. No client-side filter state syncing needed beyond the
 * router push.
 *
 * Visual layer: multi-select dropdowns replaced with chip toggles.
 * FormData contract is unchanged — checkbox/radio chips write their
 * values the same way the old selects did.
 */

// ── Chip visual primitives ────────────────────────────────────────────────
// Filter chips look like toggle buttons, not data badges. Readable size,
// sentence case, solid active fill so selection is unambiguous.
const CHIP_BASE =
  "inline-flex cursor-pointer select-none items-center text-[13px] font-medium px-2.5 py-[5px] rounded border transition-colors leading-none";
const CHIP_OFF =
  "bg-card border-border text-foreground-2 hover:border-foreground-subtle hover:bg-surface-2 hover:text-foreground";
const CHIP_ON = "bg-accent border-accent text-accent-foreground";

// State chips keep mono+uppercase since 2-char codes read better that way
const STATE_CHIP_BASE =
  "inline-flex cursor-pointer select-none items-center font-mono text-[12px] font-medium uppercase tracking-[0.04em] px-2 py-1 rounded border transition-colors leading-none";

/** Span that visually tracks the adjacent hidden peer checkbox/radio. */
function PeerChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={cn(
        CHIP_BASE,
        CHIP_OFF,
        "peer-checked:bg-accent peer-checked:border-accent peer-checked:text-accent-foreground",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-40",
      )}
    >
      {children}
    </span>
  );
}

/** Controlled chip button used for the states multi-select. */
function StateChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        STATE_CHIP_BASE,
        active ? CHIP_ON : CHIP_OFF,
        "disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      {children}
    </button>
  );
}

function FilterSectionLabel({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[12px] font-semibold text-foreground-2">
        {children}
      </span>
      {aside}
    </div>
  );
}

function singleSelectClassName() {
  return "flex h-9 w-full rounded border border-input bg-secondary px-2.5 py-1.5 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
}

export function FilterForm({ accessibleStateCodes }: { accessibleStateCodes: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const sp: Record<string, string> = {};
  searchParams.forEach((v, k) => { sp[k] = v; });
  const current: FilterState = parseFiltersFromSearchParams(sp);

  const [cityDraft, setCityDraft] = useState(current.city);
  const [zipDraft, setZipDraft] = useState(current.zip);

  useEffect(() => { setCityDraft(current.city); }, [current.city]);
  useEffect(() => { setZipDraft(current.zip); }, [current.zip]);

  // States: controlled so chip toggles are instant without a form submit
  const statesKey = current.states.join(",");
  const [selectedStates, setSelectedStates] = useState<string[]>(current.states);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setSelectedStates(current.states); }, [statesKey]);

  function toggleState(code: string) {
    setSelectedStates((prev) =>
      prev.includes(code) ? prev.filter((s) => s !== code) : [...prev, code],
    );
  }

  function applyFromForm(formData: FormData) {
    const states = (formData.getAll("states") as string[]).filter(Boolean);
    const types = (formData.getAll("types") as string[]).filter(Boolean);
    const signal = (formData.getAll("signal") as string[]).filter(Boolean);
    const archetype = (formData.getAll("archetype") as string[]).filter(Boolean);
    const days = String(formData.get("days") ?? "");
    const sort = String(formData.get("sort") ?? "newest_first");
    const showInactive = formData.get("inactive") === "1";
    const hideEvents = formData.get("hideEvents") === "1";
    const city = String(formData.get("city") ?? "").trim();
    const zip = String(formData.get("zip") ?? "").trim();

    const next: FilterState = {
      states,
      licenseTypes: types as FilterState["licenseTypes"],
      signalStrengths: signal as FilterState["signalStrengths"],
      businessArchetypes: archetype as FilterState["businessArchetypes"],
      daysWindow: days ? Number.parseInt(days, 10) : null,
      sort: (sort as FilterState["sort"]) ?? "newest_first",
      search: current.search,
      showInactive,
      dispositionTab: current.dispositionTab,
      newThisWeek: current.newThisWeek,
      city,
      zip,
      leadTypes: hideEvents ? (["recurring"] as LeadType[]) : [],
    };

    const params = serializeFiltersToSearchParams(next);
    const qs = params.toString();
    startTransition(() => { router.push(qs ? `/?${qs}` : "/"); });
  }

  function clearFilters() {
    startTransition(() => { router.push("/"); });
  }

  const active = hasActiveFilters(current) || current.showInactive;

  return (
    <form action={applyFromForm} className="space-y-5">

      {/* ── States ─────────────────────────────────────────────────── */}
      {accessibleStateCodes.length > 1 ? (
        <div className="space-y-2">
          <FilterSectionLabel>States</FilterSectionLabel>
          {/* Hidden inputs carry the controlled selection into FormData */}
          {selectedStates.map((code) => (
            <input key={code} type="hidden" name="states" value={code} />
          ))}
          <div className="flex flex-wrap gap-1.5">
            {accessibleStateCodes.map((code) => (
              <StateChip
                key={code}
                active={selectedStates.includes(code)}
                disabled={pending}
                onClick={() => toggleState(code)}
              >
                {code}
              </StateChip>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Date window ────────────────────────────────────────────── */}
      <div className="space-y-2">
        <FilterSectionLabel>Date window</FilterSectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {DAYS_OPTIONS.map((o) => (
            <label key={o.value} className="contents">
              <input
                type="radio"
                name="days"
                value={o.value}
                defaultChecked={
                  o.value === ""
                    ? current.daysWindow === null
                    : current.daysWindow === Number.parseInt(o.value, 10)
                }
                disabled={pending}
                className="sr-only peer"
              />
              <PeerChip>{o.label}</PeerChip>
            </label>
          ))}
        </div>
      </div>

      {/* ── Signal strength ────────────────────────────────────────── */}
      <div className="space-y-2">
        <FilterSectionLabel aside={<SignalMethodologyButton />}>
          Signal strength
        </FilterSectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {SIGNAL_OPTIONS.map((o) => (
            <label key={o.value} className="contents">
              <input
                type="checkbox"
                name="signal"
                value={o.value}
                defaultChecked={current.signalStrengths.includes(o.value as SignalStrength)}
                disabled={pending}
                className="sr-only peer"
              />
              <PeerChip>{o.label}</PeerChip>
            </label>
          ))}
        </div>
      </div>

      {/* ── License type ───────────────────────────────────────────── */}
      <div className="space-y-2">
        <FilterSectionLabel>License type</FilterSectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {LICENSE_TYPE_OPTIONS.map((o) => (
            <label key={o.value} className="contents">
              <input
                type="checkbox"
                name="types"
                value={o.value}
                defaultChecked={current.licenseTypes.includes(o.value as LicenseRecordType)}
                disabled={pending}
                className="sr-only peer"
              />
              <PeerChip>{o.label}</PeerChip>
            </label>
          ))}
        </div>
      </div>

      {/* ── Business archetype ─────────────────────────────────────── */}
      <div className="space-y-2">
        <FilterSectionLabel>Business archetype</FilterSectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {ARCHETYPE_OPTIONS.map((o) => (
            <label key={o.value} className="contents">
              <input
                type="checkbox"
                name="archetype"
                value={o.value}
                defaultChecked={current.businessArchetypes.includes(
                  o.value as BusinessArchetype,
                )}
                disabled={pending}
                className="sr-only peer"
              />
              <PeerChip>{o.label}</PeerChip>
            </label>
          ))}
        </div>
      </div>

      {/* Hidden inputs carry city/zip (controlled by local state) into FormData */}
      <input type="hidden" name="city" value={cityDraft} />
      <input type="hidden" name="zip" value={zipDraft} />

      {/* ── City ───────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label>City</Label>
        <CityTypeahead
          value={cityDraft}
          onChange={setCityDraft}
          selectedStates={current.states}
          disabled={pending}
        />
      </div>

      {/* ── ZIP code ───────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label htmlFor="zip-input">ZIP code</Label>
        <input
          id="zip-input"
          type="text"
          value={zipDraft}
          onChange={(e) => setZipDraft(e.target.value)}
          placeholder="e.g. 80203"
          disabled={pending}
          className={singleSelectClassName()}
        />
      </div>

      {/* ── Sort ───────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label htmlFor="sort">Sort</Label>
        <select
          id="sort"
          name="sort"
          defaultValue={current.sort}
          disabled={pending}
          className={singleSelectClassName()}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Visibility ─────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label htmlFor="inactive">Visibility</Label>
        <label
          htmlFor="inactive"
          className="flex cursor-pointer items-start gap-2 text-sm"
        >
          <input
            id="inactive"
            type="checkbox"
            name="inactive"
            value="1"
            defaultChecked={current.showInactive}
            disabled={pending}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <span className="leading-snug text-foreground-2">
            Show inactive licenses
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              Includes revoked, expired, and otherwise inactive records. Hidden
              by default.
            </span>
          </span>
        </label>
      </div>

      {/* ── Lead type ──────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label htmlFor="hideEvents">Lead type</Label>
        <label
          htmlFor="hideEvents"
          className="flex cursor-pointer items-start gap-2 text-sm"
        >
          <input
            id="hideEvents"
            type="checkbox"
            name="hideEvents"
            value="1"
            defaultChecked={
              current.leadTypes.includes("recurring") &&
              !current.leadTypes.includes("event")
            }
            disabled={pending}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <span className="leading-snug text-foreground-2">
            Recurring licenses only
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              Hides one-time event leads (festivals, fundraisers, pop-ups).
              Events are shown by default.
            </span>
          </span>
        </label>
      </div>

      {/* ── Actions ────────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending} className="flex-1">
          {pending ? "Applying…" : "Apply filters"}
        </Button>
        {active ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearFilters}
            disabled={pending}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </form>
  );
}
