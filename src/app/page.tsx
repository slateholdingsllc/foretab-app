import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Root entry. Authenticated customers route to the dashboard (Task 12).
 * Unauthenticated visitors route to login. The marketing site at foretab.com
 * is the discovery surface; app.foretab.com is post-signup.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Dashboard scaffold is Task 12. For now, route through state-selection
    // for new customers who haven't picked a trial state yet, otherwise
    // surface a placeholder until Task 12 ships.
    redirect("/state-selection");
  }

  redirect("/login");
}
