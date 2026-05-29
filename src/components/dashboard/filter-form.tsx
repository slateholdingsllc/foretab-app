"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  hasActiveFilters,
  parseFiltersFromSearchParams,
  serializeFiltersToSearchParams,
} from "@/lib/dashboard/filters";
import { getStateDisplayLabel } from "@/lib/dashboard/state-display";
import type {
  BusinessArchetype,
  FilterState,
  LicenseRecordType,
  SignalStrength,
} from "@/lib/dashboard/types";

/**
 * Filter form. URL search params are the source of truth — form
 * submission navigates to a new URL with updated params, server
 * re-renders. No client-side filter state syncing needed beyond the
 * router push.
 *
 * Sidebar variant: compact, vertical stack of dropdowns + a date
 * window selector. Submits cleared cursor (new filter set = page 1).
 */

const LICENSE_TYPE_OPTIONS: Array<{ value: LicenseRecordType; label: string }> = [
  { value: "new_issuance", label: "New issuance" },
  { value: "renewal", label: "Renewal" },
  { value: "transfer", label: "Transfer" },
  { value: "expiration", label: "Expiration" },
  { value: "suspension", label: "Suspension" },
  { value: "revocation", label: "Revocation" },
  { value: "application", label: "Application" },
];

// Display labels relabeled to New/Established/Dormant. Values stay
// hot|warm|cold so existing URLs and saved filters keep resolving.
const SIGNAL_OPTIONS: Array<{ value: SignalStrength; label: string }> = [
  { value: "hot", label: "New" },
  { value: "warm", label: "Established" },
  { value: "cold", label: "Dormant" },
];

const ARCHETYPE_OPTIONS: Array<{ value: BusinessArchetype; label: string }> = [
  { value: "bar_tavern", label: "Bar / Tavern" },
  { value: "restaurant_full_service", label: "Restaurant (full-service)" },
  { value: "restaurant_quick_serve", label: "Restaurant (quick-serve)" },
  { value: "package_store", label: "Package store" },
  { value: "grocery", label: "Grocery" },
  { value: "convenience", label: "Convenience" },
  { value: "hotel_lodging", label: "Hotel / lodging" },
  { value: "brewery", label: "Brewery" },
  { value: "winery", label: "Winery" },
  { value: "distillery", label: "Distillery" },
  { value: "wholesaler", label: "Wholesaler" },
  { value: "importer", label: "Importer" },
  { value: "club", label: "Club" },
  { value: "special_event", label: "Special event" },
  { value: "other", label: "Other" },
];

const DAYS_OPTIONS = [
  { value: "", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 180 days" },
  { value: "365", label: "Last year" },
];

const SORT_OPTIONS = [
  { value: "newest_first", label: "Newest first" },
  { value: "oldest_first", label: "Oldest first" },
];

function multiSelectClassName() {
  return "flex min-h-24 w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
}

function singleSelectClassName() {
  return "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
}

export function FilterForm({ accessibleStateCodes }: { accessibleStateCodes: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  // Convert searchParams (ReadonlyURLSearchParams) → Record for parser
  const sp: Record<string, string> = {};
  searchParams.forEach((v, k) => {
    sp[k] = v;
  });
  const current: FilterState = parseFiltersFromSearchParams(sp);

  function applyFromForm(formData: FormData) {
    const states = (formData.getAll("states") as string[]).filter(Boolean);
    const types = (formData.getAll("types") as string[]).filter(Boolean);
    const signal = (formData.getAll("signal") as string[]).filter(Boolean);
    const archetype = (formData.getAll("archetype") as string[]).filter(Boolean);
    const days = String(formData.get("days") ?? "");
    const sort = String(formData.get("sort") ?? "newest_first");

    const next: FilterState = {
      states,
      licenseTypes: types as FilterState["licenseTypes"],
      signalStrengths: signal as FilterState["signalStrengths"],
      businessArchetypes: archetype as FilterState["businessArchetypes"],
      daysWindow: days ? Number.parseInt(days, 10) : null,
      sort: (sort as FilterState["sort"]) ?? "newest_first",
    };

    const params = serializeFiltersToSearchParams(next);
    const qs = params.toString();
    // Cursor is dropped on filter change — new filter = page 1
    startTransition(() => {
      router.push(qs ? `/?${qs}` : "/");
    });
  }

  function clearFilters() {
    startTransition(() => {
      router.push("/");
    });
  }

  const active = hasActiveFilters(current);

  return (
    <form action={applyFromForm} className="space-y-4">
      {accessibleStateCodes.length > 1 ? (
        <div className="space-y-1.5">
          <Label htmlFor="states">States</Label>
          <select
            id="states"
            name="states"
            multiple
            defaultValue={current.states}
            disabled={pending}
            className={multiSelectClassName()}
            size={Math.min(accessibleStateCodes.length, 6)}
          >
            {accessibleStateCodes.map((code) => (
              <option key={code} value={code}>
                {getStateDisplayLabel(code)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="days">Date window</Label>
        <select
          id="days"
          name="days"
          defaultValue={current.daysWindow !== null ? String(current.daysWindow) : ""}
          disabled={pending}
          className={singleSelectClassName()}
        >
          {DAYS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="signal">Signal strength</Label>
        <select
          id="signal"
          name="signal"
          multiple
          defaultValue={current.signalStrengths}
          disabled={pending}
          className={multiSelectClassName()}
          size={3}
        >
          {SIGNAL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="types">License type</Label>
        <select
          id="types"
          name="types"
          multiple
          defaultValue={current.licenseTypes}
          disabled={pending}
          className={multiSelectClassName()}
          size={4}
        >
          {LICENSE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="archetype">Business archetype</Label>
        <select
          id="archetype"
          name="archetype"
          multiple
          defaultValue={current.businessArchetypes}
          disabled={pending}
          className={multiSelectClassName()}
          size={4}
        >
          {ARCHETYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

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
