import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { DegradedStateBanner } from "@/components/dashboard/degraded-state-banner";
import { DispositionTabsBar } from "@/components/dashboard/disposition-tabs-bar";
import { DensityProvider } from "@/components/dashboard/disposition/density-provider";
import { RecentlyViewed } from "@/components/dashboard/disposition/recently-viewed";
import type { StatusTabValue } from "@/components/dashboard/disposition/status-tabs";
import { Feed } from "@/components/dashboard/feed";
import {
  getRecentlyViewed,
  getStatusCounts,
} from "@/lib/disposition/actions";
// TodayPanel + Insights mounts are deferred: they require pulling from
// today.queries.ts / insights.queries.ts which currently combine
// "use server" with non-function const exports (HOT_LIKE_SIGNALS,
// WARM_LIKE_SIGNALS). Next 15 rejects that at build. Tracked in the PR
// description — flagged for Agent B to fix his file, then those two
// panels get mounted in a follow-up PR.
import { parseFiltersFromSearchParams } from "@/lib/dashboard/filters";
import {
  fetchAccessibleStateCodes,
  fetchCustomerContext,
  fetchDashboardPage,
  fetchDataSourceHealthMap,
  fetchExportStatus,
  fetchSavedFilters,
} from "@/lib/dashboard/queries";
import { createClient } from "@/lib/supabase/server";

/**
 * Dashboard root. The post-auth landing surface — what customers see
 * after they finish onboarding.
 *
 * Pre-conditions (redirects out if not met):
 *   - Customer is authenticated (the (app)/layout already checks; here
 *     redundantly for type narrowing on context)
 *   - Customer has completed /state-selection (trial exists, business_state
 *     is set). If not, send them to /state-selection to finish onboarding.
 *
 * Query path: parses URL search params into FilterState, hands off to
 * fetchDashboardPage which does the joined SELECT under RLS, then
 * renders the Feed inside the AppShell chrome.
 */
export const metadata = {
  title: "Dashboard",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();

  // Layout already redirects unauthenticated users, but we need user.id
  // for the next check — query once.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Ensure customer has completed onboarding (trial exists). If not,
  // send them to /state-selection. This handles the post-signup case
  // where the email-verification trigger created customers but
  // state-selection hasn't run yet.
  const { data: customer } = await supabase
    .from("customers")
    .select("id, current_tier")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!customer) {
    // Customer row not yet provisioned by the email_confirmed trigger.
    // Likely a fresh Google OAuth or race condition; send to verify-email
    // which surfaces a "almost there" message.
    redirect("/verify-email");
  }

  const { data: trial } = await supabase
    .from("trials")
    .select("id, expires_at")
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (!trial) {
    redirect("/state-selection");
  }

  // Trial expired and customer hasn't converted to a paid tier?
  // Send to the re-engagement screen. Per dispatch §10.3, trial data is
  // preserved for 30 days so subscribing within that window picks up
  // where they left off.
  if (
    trial.expires_at &&
    new Date(trial.expires_at) < new Date() &&
    !customer.current_tier
  ) {
    redirect("/trial-expired");
  }

  // Past the guards — fetch data in parallel.
  const resolvedSearchParams = await searchParams;
  const filters = parseFiltersFromSearchParams(resolvedSearchParams);
  const cursor =
    typeof resolvedSearchParams.cursor === "string" ? resolvedSearchParams.cursor : null;

  const [
    context,
    accessibleStateCodes,
    page,
    healthMap,
    exportStatus,
    savedFilters,
    recentlyViewed,
    statusCounts,
  ] = await Promise.all([
    fetchCustomerContext(),
    fetchAccessibleStateCodes(),
    fetchDashboardPage({ filters, cursor }),
    fetchDataSourceHealthMap(),
    fetchExportStatus(),
    fetchSavedFilters(),
    getRecentlyViewed(),
    getStatusCounts(),
  ]);

  // StatusTabs counts. `all` mirrors what the worklist currently shows
  // (totalCount under the active filter set). Specific statuses come
  // straight from getStatusCounts. `uncontacted` is left undefined for
  // now — the canonical formula (funnel.surfaced − sum of explicits)
  // depends on getDispositionFunnel from insights.queries.ts, which is
  // currently un-importable (see flag at top of file). StatusTabs hides
  // missing counts gracefully.
  const tabCounts: Partial<Record<StatusTabValue, number>> = {
    all: page.totalCount ?? undefined,
    saved: statusCounts.saved,
    working: statusCounts.working,
    won: statusCounts.won,
    lost: statusCounts.lost,
    skip: statusCounts.skip,
  };

  return (
    <AppShell
      email={context.email}
      currentTier={context.currentTier}
      trialExpiresAt={context.trialExpiresAt}
      accessibleStateCodes={accessibleStateCodes}
      savedFilters={savedFilters}
      currentFilters={filters}
    >
      <DegradedStateBanner healthMap={healthMap} />
      {/* DensityProvider wraps the whole disposition area so any client
          component below can call useDensity(). No consumers in this
          drop yet — DispositionRow / RecordCard render identically — but
          the provider's in place for the compact/comfortable toggle the
          pack expects. */}
      <DensityProvider>
        <div className="flex flex-col gap-4">
          <RecentlyViewed items={recentlyViewed} />
          <DispositionTabsBar
            active={filters.dispositionTab}
            counts={tabCounts}
          />
          <Feed
            page={page}
            filters={filters}
            healthMap={healthMap}
            exportStatus={exportStatus}
          />
        </div>
      </DensityProvider>
    </AppShell>
  );
}
