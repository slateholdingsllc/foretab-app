import { Label } from "@/components/ui/label";
import { FilterForm } from "./filter-form";

/**
 * Dashboard sidebar. Holds the filter form + Request Coverage CTA.
 *
 * Surface: bg-card, with a 1px right border — slight tone separation
 * from the main bg. Section headers use Label variant="eyebrow" for
 * the mono-uppercase brand pattern (matches the marketing site's
 * sidebar treatment).
 *
 * Request Coverage placeholder: a mailto: link with no-obligation
 * subtext per Terms § 2 (the bolded disclaimer that submitting a
 * request creates no commitment). When Agent A ships the real
 * coverage-request form, this swaps to a Link to that route.
 */
export function Sidebar({
  accessibleStateCodes,
}: {
  accessibleStateCodes: string[];
}) {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-border bg-card lg:block">
      <div className="space-y-7 p-6">
        <div>
          <Label variant="eyebrow">Filter</Label>
          <div className="mt-3">
            <FilterForm accessibleStateCodes={accessibleStateCodes} />
          </div>
        </div>

        <div className="border-t border-border-soft pt-6">
          <Label variant="eyebrow">Coverage</Label>
          <p className="mt-3 text-sm leading-relaxed text-foreground-2">
            Don&apos;t see a state you need?{" "}
            <a
              href="mailto:hi@foretab.com?subject=Coverage%20request"
              className="text-primary underline-offset-4 hover:underline"
            >
              Request coverage
            </a>
            .
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            No obligation, just a signal — submitting a request doesn&apos;t
            commit you to anything (Terms § 2).
          </p>
        </div>
      </div>
    </aside>
  );
}
