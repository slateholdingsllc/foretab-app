import type { SavedFilter } from "@/lib/dashboard/saved-filters";
import type { FilterState } from "@/lib/dashboard/types";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

/**
 * App shell — top bar across the top, sidebar on the left, main area
 * fills the rest. Used by all dashboard-class pages.
 *
 * State-selection and onboarding pages do NOT use this — they have
 * their own focused single-card layout via the (app)/layout.tsx
 * minimal container.
 *
 * savedFilters + currentFilters drive the top-bar Views dropdown. The
 * /account page (which also uses AppShell) doesn't have meaningful filter
 * state — it passes DEFAULT_FILTER_STATE and an empty list, which makes
 * the dropdown render as "no saved views yet" with a disabled save form.
 */
export function AppShell({
  email,
  currentTier,
  trialExpiresAt,
  accessibleStateCodes,
  savedFilters,
  currentFilters,
  children,
}: {
  email: string | null;
  currentTier: string | null;
  trialExpiresAt: string | null;
  accessibleStateCodes: string[];
  savedFilters: SavedFilter[];
  currentFilters: FilterState;
  children: React.ReactNode;
}) {
  return (
    // -m-4 negates the parent (app)/layout's p-4 so the dashboard runs
    // edge-to-edge; min-h-screen fills the viewport. State-selection (the
    // other (app)/* page) is unaffected — it has its own centered-card
    // layout that benefits from the layout's padding.
    <div className="-m-4 min-h-screen bg-background">
      <TopBar
        email={email}
        currentTier={currentTier}
        trialExpiresAt={trialExpiresAt}
        savedFilters={savedFilters}
        currentFilters={currentFilters}
      />
      <div className="flex">
        <Sidebar accessibleStateCodes={accessibleStateCodes} />
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
