"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { getStateDisplayLabel } from "@/lib/dashboard/state-display";
import { serializeFiltersToSearchParams } from "@/lib/dashboard/filters";
import type { FilterState } from "@/lib/dashboard/types";
import {
  archetypeLabel,
  daysLabel,
  licenseTypeLabel,
} from "@/lib/dashboard/filter-options";

/**
 * ActiveFilterChips — the at-a-glance "what's applied" row for mobile.
 *
 * On desktop the sidebar makes active filters visible; on mobile the sidebar
 * is hidden, so this chip row (under the search field) is how a rep sees and
 * removes applied filters without opening the sheet. Each chip × navigates to
 * a URL with that one facet removed — same URL-param model as everything else.
 *
 * Mobile-only — render inside an `lg:hidden` container.
 *
 * `search` is intentionally NOT shown here (it has its own field + clear),
 * and `dispositionTab` is owned by the StatusTabs row, so neither appears as
 * a chip.
 */
export function ActiveFilterChips({ filters }: { filters: FilterState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(next: FilterState) {
    const params = serializeFiltersToSearchParams(next); // omits cursor → page 1
    const qs = params.toString();
    startTransition(() => router.push(qs ? `/?${qs}` : "/"));
  }

  // Build the chip list from the active facets.
  const chips: Array<{ key: string; label: string; remove: () => void }> = [];

  for (const code of filters.states) {
    chips.push({
      key: `state-${code}`,
      label: getStateDisplayLabel(code),
      remove: () =>
        navigate({ ...filters, states: filters.states.filter((c) => c !== code) }),
    });
  }
  for (const sig of filters.signalStrengths) {
    chips.push({
      key: `sig-${sig}`,
      label: sig,
      remove: () =>
        navigate({
          ...filters,
          signalStrengths: filters.signalStrengths.filter((s) => s !== sig),
        }),
    });
  }
  for (const t of filters.licenseTypes) {
    chips.push({
      key: `type-${t}`,
      label: licenseTypeLabel(t),
      remove: () =>
        navigate({
          ...filters,
          licenseTypes: filters.licenseTypes.filter((x) => x !== t),
        }),
    });
  }
  for (const a of filters.businessArchetypes) {
    chips.push({
      key: `arch-${a}`,
      label: archetypeLabel(a),
      remove: () =>
        navigate({
          ...filters,
          businessArchetypes: filters.businessArchetypes.filter((x) => x !== a),
        }),
    });
  }
  if (filters.daysWindow !== null) {
    chips.push({
      key: "days",
      label: daysLabel(filters.daysWindow),
      remove: () => navigate({ ...filters, daysWindow: null }),
    });
  }
  if (filters.newThisWeek) {
    chips.push({
      key: "new-week",
      label: "New this week",
      remove: () => navigate({ ...filters, newThisWeek: false }),
    });
  }
  if (filters.showInactive) {
    chips.push({
      key: "inactive",
      label: "Incl. inactive",
      remove: () => navigate({ ...filters, showInactive: false }),
    });
  }
  if (filters.city.length > 0) {
    chips.push({
      key: "city",
      label: `City: ${filters.city}`,
      remove: () => navigate({ ...filters, city: "" }),
    });
  }
  if (filters.zip.length > 0) {
    chips.push({
      key: "zip",
      label: `ZIP: ${filters.zip}`,
      remove: () => navigate({ ...filters, zip: "" }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.remove}
          disabled={pending}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--color-accent-ring)] bg-accent-tint px-3 py-1.5 text-[12.5px] font-medium text-primary transition-colors disabled:opacity-60"
        >
          {c.label}
          <span aria-hidden="true" className="text-sm opacity-70">
            ×
          </span>
          <span className="sr-only">Remove filter</span>
        </button>
      ))}
    </div>
  );
}
