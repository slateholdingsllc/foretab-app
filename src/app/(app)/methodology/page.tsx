import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { SignalMethodology } from "@/components/dashboard/signal-methodology";
import { fetchCustomerContext, fetchSavedFilters } from "@/lib/dashboard/queries";
import { DEFAULT_FILTER_STATE } from "@/lib/dashboard/types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "How signals work" };

export default async function MethodologyRoute() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [contextResult, savedFiltersResult] = await Promise.allSettled([
    fetchCustomerContext(),
    fetchSavedFilters(),
  ]);

  const context =
    contextResult.status === "fulfilled"
      ? contextResult.value
      : { email: null, currentTier: null, trialExpiresAt: null, customerId: null, status: null };
  const savedFilters =
    savedFiltersResult.status === "fulfilled" ? savedFiltersResult.value : [];

  return (
    <AppShell
      email={context.email}
      currentTier={context.currentTier}
      trialExpiresAt={context.trialExpiresAt}
      accessibleStateCodes={[]}
      savedFilters={savedFilters}
      currentFilters={DEFAULT_FILTER_STATE}
      hideSidebar
    >
      <SignalMethodology />
    </AppShell>
  );
}
