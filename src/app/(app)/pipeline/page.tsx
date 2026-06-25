import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { SectionDegraded } from "@/components/dashboard/section-degraded";
import { PipelinePage } from "@/components/dashboard/pipeline-page";
import { getStatusCounts } from "@/lib/disposition/actions";
import {
  getActivityLast30Days,
  getDispositionFunnel,
  getWinRateBySignal,
} from "@/lib/disposition/insights.queries";
import {
  fetchCustomerContext,
  fetchSavedFilters,
} from "@/lib/dashboard/queries";
import { DEFAULT_FILTER_STATE } from "@/lib/dashboard/types";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Pipeline",
};

/**
 * /pipeline — full-page analytics deep-dive.
 *
 * Funnel / win-rate / activity given real vertical and horizontal room,
 * without the feed or filter sidebar. The cockpit band on the Worklist
 * landing shows the same data in compact form; this page is where the rep
 * goes to reason about their pipeline health.
 *
 * Auth gates mirror the Worklist: requires completed onboarding (trial
 * exists or internal) and a non-expired trial. The filter sidebar is
 * suppressed (AppShell hideSidebar) — the page is read-only analytics.
 *
 * Data: reuses existing RPCs — getDispositionFunnel, getWinRateBySignal,
 * getActivityLast30Days, getStatusCounts. No new queries.
 */
export default async function PipelineRoute() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: customer } = await supabase
    .from("customers")
    .select("id, current_tier, account_type")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!customer) redirect("/verify-email");

  const isInternal = customer.account_type === "internal";

  const { data: trial } = await supabase
    .from("trials")
    .select("id, expires_at")
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (!trial && !isInternal) redirect("/state-selection");

  if (
    !isInternal &&
    trial?.expires_at &&
    new Date(trial.expires_at) < new Date() &&
    !customer.current_tier
  ) {
    redirect("/trial-expired");
  }

  const [
    contextResult,
    savedFiltersResult,
    funnelResult,
    winRateResult,
    activityResult,
    statusCountsResult,
  ] = await Promise.allSettled([
    fetchCustomerContext(),
    fetchSavedFilters(),
    getDispositionFunnel(),
    getWinRateBySignal(),
    getActivityLast30Days(),
    getStatusCounts(),
  ]);

  const context =
    contextResult.status === "fulfilled"
      ? contextResult.value
      : { email: null, currentTier: null, trialExpiresAt: null, customerId: null, status: null };
  const savedFilters =
    savedFiltersResult.status === "fulfilled" ? savedFiltersResult.value : [];
  const funnel =
    funnelResult.status === "fulfilled" ? funnelResult.value : null;
  const winRate =
    winRateResult.status === "fulfilled" ? winRateResult.value : [];
  const activity =
    activityResult.status === "fulfilled" ? activityResult.value : [];
  const statusCounts =
    statusCountsResult.status === "fulfilled" ? statusCountsResult.value : null;

  return (
    <AppShell
      email={context.email}
      currentTier={context.currentTier}
      trialExpiresAt={context.trialExpiresAt}
      accessibleStateCodes={[]}
      savedFilters={savedFilters}
      currentFilters={DEFAULT_FILTER_STATE}
      hideSidebar
      viewport="full"
    >
      {funnel !== null ? (
        <PipelinePage
          funnel={funnel}
          winRate={winRate}
          activity={activity}
          statusCounts={statusCounts}
        />
      ) : (
        <SectionDegraded message="Pipeline data is temporarily unavailable" />
      )}
    </AppShell>
  );
}
