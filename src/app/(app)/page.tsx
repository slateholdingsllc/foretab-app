import { ActiveFilterChips } from "@/components/dashboard/active-filter-chips";
import { AppShell } from "@/components/dashboard/app-shell";
import { DispositionTabsBar } from "@/components/dashboard/disposition-tabs-bar";
import { DensityProvider } from "@/components/dashboard/disposition/density-provider";
import { StatusCountsProvider } from "@/components/dashboard/disposition/status-counts-context";
import type { StatusTabValue } from "@/components/dashboard/disposition/status-tabs";
import { TodayPanel } from "@/components/dashboard/disposition/today-panel";
import { Feed } from "@/components/dashboard/feed";
import { GuidedTour } from "@/components/dashboard/guided-tour";
import { MobileWorklistControls } from "@/components/dashboard/mobile-worklist-controls";
import { SectionDegraded } from "@/components/dashboard/section-degraded";
import { WorklistLayout, WorklistRail } from "@/components/dashboard/worklist-layout";
import { WorklistSearchBar } from "@/components/dashboard/worklist-search-bar";
import {
  hasActiveFilters,
  parseFiltersFromSearchParams,
  serializeFiltersToSearchParams,
} from "@/lib/dashboard/filters";
import {
  type ExportStatus,
  fetchAccessibleStateCodes,
  fetchCustomerContext,
  fetchDashboardPageByBusiness,
  fetchDataSourceHealthMap,
  fetchExportStatus,
  fetchSavedFilters,
  fetchUncontactedCount,
} from "@/lib/dashboard/queries";
import { getStatusCounts } from "@/lib/disposition/actions";
import { getDueFollowUpsForToday, getNewHighPriority } from "@/lib/disposition/today.queries";
import { QuotaExceededError } from "@/lib/rpc/errors";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

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

  // Canonicalize bare landing to the Opening Now default view so the URL
  // always carries the active filters. Chips, presets, and export links all
  // read from the URL as single truth — this redirect ensures they're correct
  // on first load without invisible server-side injection.
  if (Object.keys(resolvedSearchParams).length === 0) {
    redirect("/?types=new_issuance,application&days=180");
  }

  const filters = parseFiltersFromSearchParams(resolvedSearchParams);
  // Opening Now is active when both new-issuance + application types are in
  // the URL and a time window is set — matches the preset canonical URL.
  const isOpeningNow =
    filters.licenseTypes.includes("new_issuance") &&
    filters.licenseTypes.includes("application") &&
    filters.daysWindow !== null;
  const cursor =
    typeof resolvedSearchParams.cursor === "string" ? resolvedSearchParams.cursor : null;

  // Feed query runs in parallel but is NOT awaited here — Suspense streams
  // it to the client once resolved, so the page shell renders immediately.
  // Worklist is always business-grain (one row per business) per dispatch.
  const feedPromise = fetchDashboardPageByBusiness({ filters, cursor });

  const [
    contextResult,
    accessibleStateCodesResult,
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
    fetchDataSourceHealthMap(),
    fetchExportStatus(),
    fetchSavedFilters(),
    getDueFollowUpsForToday(10),
    getNewHighPriority(10),
    getStatusCounts(),
    fetchUncontactedCount(filters),
  ]);

  const DEFAULT_EXPORT_STATUS: ExportStatus = {
    isTrial: false,
    cap: null,
    canExport: false,
  };

  const context =
    contextResult.status === "fulfilled"
      ? contextResult.value
      : { customerId: null, email: null, status: null, currentTier: null, trialExpiresAt: null };
  const accessibleStateCodes =
    accessibleStateCodesResult.status === "fulfilled" ? accessibleStateCodesResult.value : [];
  const healthMap = healthMapResult.status === "fulfilled" ? healthMapResult.value : new Map();
  const exportStatus =
    exportStatusResult.status === "fulfilled" ? exportStatusResult.value : DEFAULT_EXPORT_STATUS;
  const savedFilters = savedFiltersResult.status === "fulfilled" ? savedFiltersResult.value : [];
  const dueFollowUps = dueFollowUpsResult.status === "fulfilled" ? dueFollowUpsResult.value : null;
  const newHighPriority =
    newHighPriorityResult.status === "fulfilled" ? newHighPriorityResult.value : null;
  const statusCounts = statusCountsResult.status === "fulfilled" ? statusCountsResult.value : null;
  const uncontactedCount =
    uncontactedCountResult.status === "fulfilled" ? uncontactedCountResult.value : null;

  // StatusTabs counts — degrade gracefully when statusCounts fails.
  const tabCounts: Partial<Record<StatusTabValue, number>> = {
    all: undefined, // resolved via the streamed feed
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
    <StatusCountsProvider initialCounts={tabCounts}>
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
                  resultCount={undefined}
                />
                {/* Desktop search + Export CSV — hidden on mobile */}
                {(() => {
                  const exportParams = serializeFiltersToSearchParams(filters);
                  const exportHref = `/api/export.csv${exportParams.toString() ? `?${exportParams.toString()}` : ""}`;
                  return (
                    <div className="hidden lg:flex lg:items-center lg:gap-2">
                      <div className="min-w-0 flex-1">
                        <WorklistSearchBar filters={filters} className="mb-0" />
                      </div>
                      {exportStatus.canExport ? (
                        <a
                          href={exportHref}
                          title={
                            exportStatus.isTrial
                              ? `Trial: up to ${(exportStatus.cap ?? 0) - (exportStatus.alreadyExported ?? 0)} more rows`
                              : "Export CSV (unlimited for paid)"
                          }
                          className="inline-flex h-12 shrink-0 items-center rounded-xl border border-border bg-card px-3.5 font-sans text-[13px] font-medium text-foreground-2 transition-colors hover:border-foreground-subtle hover:text-foreground"
                        >
                          Export CSV
                        </a>
                      ) : (
                        <span
                          aria-disabled="true"
                          title={
                            exportStatus.isTrial
                              ? `Trial export limit reached (${exportStatus.cap ?? 0} records). Upgrade for higher limits.`
                              : "Export unavailable for your account."
                          }
                          className="inline-flex h-12 shrink-0 cursor-not-allowed items-center rounded-xl border border-border bg-card px-3.5 font-sans text-[13px] font-medium text-foreground-2 opacity-40"
                        >
                          Export CSV
                        </span>
                      )}
                    </div>
                  );
                })()}
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
                  <DispositionTabsBar active={filters.dispositionTab} serverCounts={tabCounts} />
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
            <Suspense fallback={null}>
              <StreamedFeed
                feedPromise={feedPromise}
                filters={filters}
                healthMap={healthMap}
                exportStatus={exportStatus}
                isOpeningNow={isOpeningNow}
              />
            </Suspense>
          </WorklistLayout>
        </DensityProvider>
      </AppShell>
    </StatusCountsProvider>
  );
}

/** Awaits the feed promise inside a Suspense boundary — streams records to
 *  the client once the query resolves without blocking the page shell. */
async function StreamedFeed({
  feedPromise,
  filters,
  healthMap,
  exportStatus,
  isOpeningNow,
}: {
  feedPromise: ReturnType<typeof fetchDashboardPageByBusiness>;
  filters: Parameters<typeof fetchDashboardPageByBusiness>[0]["filters"];
  healthMap: Parameters<typeof Feed>[0]["healthMap"];
  exportStatus: ExportStatus;
  isOpeningNow: boolean;
}) {
  try {
    const page = await feedPromise;
    return (
      <Feed
        page={page}
        filters={filters}
        healthMap={healthMap}
        exportStatus={exportStatus}
        isOpeningNow={isOpeningNow}
      />
    );
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return (
        <SectionDegraded
          message="You've reached your daily record limit. Resets at midnight UTC."
          showRetry={false}
        />
      );
    }
    return <SectionDegraded message="Records are taking longer than usual" />;
  }
}
