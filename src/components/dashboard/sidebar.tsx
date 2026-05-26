import { FilterForm } from "./filter-form";

/**
 * Dashboard sidebar. Holds the filter form + Request Coverage CTA.
 *
 * Request Coverage placeholder: a mailto: link with no-obligation
 * subtext per Terms § 2 (the bolded disclaimer that submitting a
 * request creates no commitment). When Agent A ships the real
 * coverage-request form, this swaps to a Link to that route.
 */
export function Sidebar({ accessibleStateCodes }: { accessibleStateCodes: string[] }) {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-input bg-card lg:block">
      <div className="space-y-6 p-6">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Filter
          </h2>
          <div className="mt-3">
            <FilterForm accessibleStateCodes={accessibleStateCodes} />
          </div>
        </div>

        <div className="border-t border-input pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Coverage
          </h2>
          <p className="mt-3 text-sm">
            Don&apos;t see a state you need?{" "}
            <a
              href="mailto:hi@foretab.com?subject=Coverage%20request"
              className="text-primary hover:underline"
            >
              Request coverage
            </a>
            .
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            No obligation, just a signal — submitting a request doesn&apos;t commit you to anything (Terms § 2).
          </p>
        </div>
      </div>
    </aside>
  );
}
