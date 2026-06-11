import { cn } from "@/lib/utils";
import type { SavedFilter } from "@/lib/dashboard/saved-filters";
import type { FilterState, StateHealthMap } from "@/lib/dashboard/types";
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
  healthMap,
  viewport = "scroll",
  children,
}: {
  email: string | null;
  currentTier: string | null;
  trialExpiresAt: string | null;
  accessibleStateCodes: string[];
  savedFilters: SavedFilter[];
  currentFilters: FilterState;
  /** Thread from fetchDataSourceHealthMap; drives sidebar heartbeat + mobile topbar indicator. */
  healthMap?: StateHealthMap | null;
  /**
   * "scroll" — page-level scroll, min-h-screen (account page, onboarding).
   * "full"   — viewport-height-locked (worklist); each column scrolls independently.
   */
  viewport?: "scroll" | "full";
  children: React.ReactNode;
}) {
  const full = viewport === "full";
  return (
    // -m-4 negates the parent (app)/layout's p-4 so the dashboard runs
    // edge-to-edge. viewport="full" uses h-dvh so the worklist columns
    // scroll independently; viewport="scroll" keeps the original min-h-screen.
    <div
      className={cn(
        "-m-4 bg-background",
        full ? "flex h-dvh flex-col" : "min-h-screen",
      )}
    >
      <TopBar
        email={email}
        currentTier={currentTier}
        trialExpiresAt={trialExpiresAt}
        savedFilters={savedFilters}
        currentFilters={currentFilters}
        healthMap={healthMap}
      />
      <div className={cn("flex", full && "min-h-0 flex-1")}>
        <Sidebar
          accessibleStateCodes={accessibleStateCodes}
          healthMap={healthMap ?? new Map()}
        />
        <main
          className={cn(
            "min-w-0 flex-1",
            full ? "min-h-0" : "p-6",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
