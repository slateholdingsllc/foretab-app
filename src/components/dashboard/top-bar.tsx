import Link from "next/link";
import { signOut } from "@/lib/actions/auth";
import { Badge } from "@/components/ui/badge";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { SavedFilter } from "@/lib/dashboard/saved-filters";
import type { FilterState, StateHealthMap } from "@/lib/dashboard/types";
import { DataHealthIndicator } from "./data-health-indicator";
import { NavTabs } from "./nav-tabs";
import { SavedFiltersMenu } from "./saved-filters-menu";
import { TrialBadge } from "./trial-badge";

/**
 * Top bar of the dashboard chrome.
 *
 * Layout (left → right):
 *   - BrandMark + "foretab" wordmark, links home
 *   - flex spacer
 *   - DataHealthIndicator (mobile only, lg:hidden — sidebar heartbeat covers desktop)
 *   - SavedFiltersMenu (Views)
 *   - tier soft-accent chip
 *   - TrialBadge (only renders when on trial)
 *   - email (sm: and up)
 *   - ThemeToggle (Light · Dark · System)
 *   - Account link
 *   - Sign-out button
 *
 * The Account link stays top-level (not behind a menu) to satisfy the
 * legal reviewer's parallel principle: cancel/manage CTAs must be as
 * findable as upgrade CTAs.
 */
export function TopBar({
  email,
  currentTier,
  trialExpiresAt,
  savedFilters,
  currentFilters,
  healthMap,
}: {
  email: string | null;
  currentTier: string | null;
  trialExpiresAt: string | null;
  savedFilters: SavedFilter[];
  currentFilters: FilterState;
  healthMap?: StateHealthMap | null;
}) {
  return (
    <header className="border-b border-border bg-card">
      <div className="flex h-14 items-center gap-3 px-5">
        <Link
          href="/"
          className="flex items-center gap-2 text-foreground transition-opacity hover:opacity-85"
          aria-label="Foretab home"
        >
          <BrandMark className="size-7" />
          <span className="text-[19px] font-semibold tracking-[-0.03em]">
            foretab
          </span>
        </Link>

        <NavTabs />

        <div className="flex flex-1 items-center justify-end gap-3">
          {healthMap ? (
            <DataHealthIndicator
              healthMap={healthMap}
              variant="topbar"
              className="lg:hidden"
            />
          ) : null}

          <SavedFiltersMenu
            savedFilters={savedFilters}
            currentFilters={currentFilters}
          />

          {currentTier ? (
            <Badge variant="soft" className="capitalize">
              {currentTier.replace(/_/g, " ")}
            </Badge>
          ) : null}

          <TrialBadge trialExpiresAt={trialExpiresAt} />

          {email ? (
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
              {email}
            </span>
          ) : null}

          <ThemeToggle />

          <Link
            href="/account"
            className="text-sm font-medium tracking-[-0.005em] text-foreground-2 underline-offset-4 hover:text-foreground hover:underline"
          >
            Account
          </Link>

          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
