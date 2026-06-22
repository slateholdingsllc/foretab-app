import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/dashboard/app-shell";
import { DispositionTabsBar } from "@/components/dashboard/disposition-tabs-bar";
import { MobileWorklistControls } from "@/components/dashboard/mobile-worklist-controls";
import { SectionDegraded } from "@/components/dashboard/section-degraded";
import { WorklistSearchBar } from "@/components/dashboard/worklist-search-bar";
import { DensityProvider } from "@/components/dashboard/disposition/density-provider";
import type { StatusTabValue } from "@/components/dashboard/disposition/status-tabs";
import { TodayPanel } from "@/components/dashboard/disposition/today-panel";
import { Feed } from "@/components/dashboard/feed";
import { WorklistLayout, WorklistRail } from "@/components/dashboard/worklist-layout";
import { getStatusCounts } from "@/lib/disposition/actions";
import {
  getDueFollowUpsForToday,
  getNewHighPriority,
} from "@/lib/disposition/today.queries";
import { hasActiveFilters, parseFiltersFromSearchParams } from "@/lib/dashboard/filters";
import {
  fetchAccessibleStateCodes,
  fetchCustomerContext,
  fetchDashboardPage,
  fetchUncontactedCount,
  fetchDataSourceHealthMap,
  fetchExportStatus,
  fetchSavedFilters,
  type ExportStatus,
  PAID_EXPORT_MAX_ROWS,
} from "@/lib/dashboard/queries";
import { ActiveFilterChips } from "@/components/dashboard/active-filter-chips";
import { GuidedTour } from "@/components/dashboard/guided-tour";
import { QuotaExceededError } from "@/lib/rpc/errors";
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

  // Past the guards — fetch data in parallel. allSettled so one slow query
  // can't crash the whole page — sections render degraded states independently.
  const resolvedSearchParams = await searchParams;
  const filters = parseFiltersFromSearchParams(resolvedSearchParams);
  const cursor =
    typeof resolvedSearchParams.cursor === "string" ? resolvedSearchParams.cursor : null;

  const [
    contextResult,
    accessibleStateCodesResult,
    pageResult,
    healthMapResult,
    exportStatusResult,
    savedFiltersResult,
    dueFollowUpsResult,
    newHighPriorityResult,
    statusCountsResult,
    uncontactedCountResult,
  ] = await Promise.allSettled([
    fetchCustomerContext(),
    fetchAccessibleStateCodes(),
    fetchDashboardPage({ filters, cursor }),
    fetchDataSourceHealthMap(),
    fetchExportStatus(),
    fetchSavedFilters(),
    getDueFollowUpsForToday(),
    getNewHighPriority(),
    getStatusCounts(),
    fetchUncontactedCount(filters),
  ]);

  const DEFAULT_EXPORT_STATUS: ExportStatus = {
    isTrial: false,
    cap: PAID_EXPORT_MAX_ROWS,
    canExport: false,
  };

  const context =
    contextResult.status === "fulfilled"
      ? contextResult.value
      : { customerId: null, email: null, status: null, currentTier: null, trialExpiresAt: null };
  const accessibleStateCodes =
    accessibleStateCodesResult.status === "fulfilled"
      ? accessibleStateCodesResult.value
      : [];
  const page =
    pageResult.status === "fulfilled" ? pageResult.value : null;
  const feedError =
    pageResult.status === "rejected" ? pageResult.reason : null;
  const healthMap =
    healthMapResult.status === "fulfilled" ? healthMapResult.value : new Map();
  const exportStatus =
    exportStatusResult.status === "fulfilled"
      ? exportStatusResult.value
      : DEFAULT_EXPORT_STATUS;
  const savedFilters =
    savedFiltersResult.status === "fulfilled" ? savedFiltersResult.value : [];
  const dueFollowUps =
    dueFollowUpsResult.status === "fulfilled" ? dueFollowUpsResult.value : null;
  const newHighPriority =
    newHighPriorityResult.status === "fulfilled"
      ? newHighPriorityResult.value
      : null;
  const statusCounts =
    statusCountsResult.status === "fulfilled" ? statusCountsResult.value : null;
  const uncontactedCount =
    uncontactedCountResult.status === "fulfilled"
      ? uncontactedCountResult.value
      : null;

  // StatusTabs counts — degrade gracefully when statusCounts fails.
  const tabCounts: Partial<Record<StatusTabValue, number>> = {
    all: page?.totalCount ?? undefined,
    ...(statusCounts
      ? {
          uncontacted: uncontactedCount ?? undefined,
          saved: statusCounts.saved,
          working: statusCounts.working,
          won: statusCounts.won,
          lost: statusCounts.lost,
          skip: statusCounts.skip,
        }
      : {}),
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
      <GuidedTour />
      {/* DensityProvider wraps the worklist so client components below can
          call useDensity() for the compact/comfortable toggle. */}
      <DensityProvider>
        <WorklistLayout
          className="h-full"
          tabs={
            <>
              <MobileWorklistControls
                filters={filters}
                accessibleStateCodes={accessibleStateCodes}
                savedFilters={savedFilters}
                resultCount={page?.totalCount ?? undefined}
              />
              {/* Desktop search — hidden on mobile; MobileWorklistControls renders its own. */}
              <div className="hidden lg:block">
                <WorklistSearchBar filters={filters} />
              </div>
              {/* Desktop active-filter scope — shows chips when filters are applied,
                  fallback text when none so the rep always knows what scope is live. */}
              <div className="hidden lg:flex lg:items-center">
                <ActiveFilterChips filters={filters} />
                {!hasActiveFilters(filters) && (
                  <p className="text-[11px] leading-none text-foreground-subtle">
                    Viewing all {accessibleStateCodes.length} accessible states
                  </p>
                )}
              </div>
              <Suspense fallback={null}>
                <DispositionTabsBar
                  active={filters.dispositionTab}
                  counts={tabCounts}
                />
              </Suspense>
            </>
          }
          rail={
            <WorklistRail
              today={
                dueFollowUps !== null && newHighPriority !== null ? (
                  <TodayPanel due={dueFollowUps} newLeads={newHighPriority} />
                ) : (
                  <SectionDegraded message="Today's panel is temporarily unavailable" />
                )
              }
            />
          }
        >
          {page !== null ? (
            <Feed
              page={page}
              filters={filters}
              healthMap={healthMap}
              exportStatus={exportStatus}
            />
          ) : feedError instanceof QuotaExceededError ? (
            <SectionDegraded
              message="You've reached your daily record limit. Resets at midnight UTC."
              showRetry={false}
            />
          ) : (
            <SectionDegraded message="Records are taking longer than usual" />
          )}
        </WorklistLayout>
      </DensityProvider>
    </AppShell>
  );
}
