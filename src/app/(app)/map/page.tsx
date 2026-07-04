import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { MapPageClient } from "@/components/map/map-page-client";
import { parseFiltersFromSearchParams } from "@/lib/dashboard/filters";
import {
  fetchCustomerContext,
  fetchAccessibleStateCodes,
  fetchSavedFilters,
} from "@/lib/dashboard/queries";
import { fetchMapPins } from "@/lib/rpc/feed";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Map",
};

export default async function MapRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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

  const resolvedSearchParams = await searchParams;
  const filters = parseFiltersFromSearchParams(resolvedSearchParams);

  const [contextResult, accessibleStateCodesResult, savedFiltersResult, pinsResult] =
    await Promise.allSettled([
      fetchCustomerContext(),
      fetchAccessibleStateCodes(),
      fetchSavedFilters(),
      fetchMapPins(filters),
    ]);

  const context =
    contextResult.status === "fulfilled"
      ? contextResult.value
      : { customerId: null, email: null, status: null, currentTier: null, trialExpiresAt: null };
  const accessibleStateCodes =
    accessibleStateCodesResult.status === "fulfilled"
      ? accessibleStateCodesResult.value
      : [];
  const savedFilters =
    savedFiltersResult.status === "fulfilled" ? savedFiltersResult.value : [];
  const mapData =
    pinsResult.status === "fulfilled"
      ? pinsResult.value
      : { pins: [], placedCount: 0, unplacedCount: 0 };

  return (
    <AppShell
      email={context.email}
      currentTier={context.currentTier}
      trialExpiresAt={context.trialExpiresAt}
      accessibleStateCodes={accessibleStateCodes}
      savedFilters={savedFilters}
      currentFilters={filters}
      viewport="full"
      hideSidebar
    >
      <MapPageClient
        initialPins={mapData.pins}
        placedCount={mapData.placedCount}
        unplacedCount={mapData.unplacedCount}
      />
    </AppShell>
  );
}
