import { redirect } from "next/navigation";
import { StateSelectionForm } from "@/components/auth/state-selection-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Pick your trial state",
};

export default async function StateSelectionPage() {
  const supabase = await createClient();

  // If the customer already has a trial, skip state selection.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (customer) {
    const { data: existingTrial } = await supabase
      .from("trials")
      .select("id")
      .eq("customer_id", customer.id)
      .maybeSingle();
    if (existingTrial) redirect("/");
  }

  // Sellable states come from the states_active_for_sale view (defined in
  // Phase 2 Task 9 migration 009). View auto-expands as Phase 1 ships new
  // states — no client-side hardcoding.
  const { data: states } = await supabase
    .from("states_active_for_sale")
    .select("id, state_code, authority_name, refresh_frequency")
    .order("state_code");

  return (
    <div className="max-w-md mx-auto pt-12">
      <Card>
        <CardHeader>
          <CardTitle>Pick your trial state</CardTitle>
          <CardDescription>
            Your 7-day trial gives you full access to one US state's license intel.
            You can upgrade to multi-state or all-access anytime.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StateSelectionForm states={states ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
