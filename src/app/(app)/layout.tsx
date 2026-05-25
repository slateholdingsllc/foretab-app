import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Authenticated app layout. The middleware already redirects unauthenticated
 * users to /login, but we double-check at the layout level as defense in
 * depth (and to give us the user object for any layout-level rendering).
 *
 * Dashboard chrome (top bar, nav, account menu) lands in Task 12. This
 * layout is currently minimal — just a container — to keep Task 11 focused
 * on auth + state selection.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <main className="min-h-screen bg-muted/30 p-4">{children}</main>;
}
