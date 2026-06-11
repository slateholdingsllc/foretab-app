import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { DispositionTabsBar } from "@/components/dashboard/disposition-tabs-bar";
import { DensityProvider } from "@/components/dashboard/disposition/density-provider";
import type { StatusTabValue } from "@/components/dashboard/disposition/status-tabs";
import { TodayPanel } from "@/components/dashboard/disposition/today-panel";
import { Feed } from "@/components/dashboard/feed";
import { WorklistLayout, WorklistRail } from "@/components/dashboard/worklist-layout";
import { getStatusCounts } from "@/lib/disposition/actions";
import { getDispositionFunnel } from "@/lib/disposition/insights.queries";
import {
  getDueFollowUpsForToday,
  getNewHighPriority,
} from "@/lib/disposition/today.queries";
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
 * fetchDashboardPage which does the joined SELECT under RLS, then renders
 * records into WorklistLayout inside the AppShell chrome.
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
    .select("id, current_tier, account_type")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!customer) {
    // Customer row not yet provisioned by the email_confirmed trigger.
    // Likely a fresh Google OAuth or race condition; send to verify-email
    // which surfaces a "almost there" message.
    redirect("/verify-email");
  }

  // Internal (founder/test) accounts bypass all trial gates. They get access
  // to all sellable states via customer_accessible_state_ids() without a trial.
  const isInternal = customer.account_type === "internal";

  const { data: trial } = await supabase
    .from("trials")
    .select("id, expires_at")
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (!trial && !isInternal) {
    redirect("/state-selection");
  }

  // Trial expired and customer hasn't converted to a paid tier?
  // Send to the re-engagement screen. Per dispatch §10.3, trial data is
  // preserved for 30 days so subscribing within that window picks up
  // where they left off.
  if (
    !isInternal &&
    trial?.expires_at &&
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
    dueFollowUps,
    newHighPriority,
    statusCounts,
    funnel,
  ] = await Promise.all([
    fetchCustomerContext(),
    fetchAccessibleStateCodes(),
    fetchDashboardPage({ filters, cursor }),
    fetchDataSourceHealthMap(),
    fetchExportStatus(),
    fetchSavedFilters(),
    getDueFollowUpsForToday(),
    getNewHighPriority(),
    getStatusCounts(),
    getDispositionFunnel(),
  ]);

  // StatusTabs counts. `all` mirrors the worklist totalCount under the
  // active filter set. `uncontacted` = funnel.surfaced minus all explicit
  // disposition rows (the implicit no-row bucket).
  const explicitDispositionedSum =
    statusCounts.saved +
    statusCounts.working +
    statusCounts.won +
    statusCounts.lost +
    statusCounts.skip;
  const tabCounts: Partial<Record<StatusTabValue, number>> = {
    all: page.totalCount ?? undefined,
    uncontacted: Math.max(0, funnel.surfaced - explicitDispositionedSum),
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
      healthMap={healthMap}
      viewport="full"
    >
      {/* DensityProvider wraps the worklist so client components below can
          call useDensity() for the compact/comfortable toggle. */}
      <DensityProvider>
        <WorklistLayout
          className="h-full"
          tabs={
            <DispositionTabsBar
              active={filters.dispositionTab}
              counts={tabCounts}
            />
          }
          rail={
            <WorklistRail
              today={<TodayPanel due={dueFollowUps} newLeads={newHighPriority} />}
            />
          }
        >
          <Feed
            page={page}
            filters={filters}
            healthMap={healthMap}
            exportStatus={exportStatus}
          />
        </WorklistLayout>
      </DensityProvider>
    </AppShell>
  );
}
