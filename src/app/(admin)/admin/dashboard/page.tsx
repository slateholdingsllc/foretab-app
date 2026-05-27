import { getAdminSession } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

/**
 * /admin/dashboard — Phase 3 Task 21 placeholder.
 *
 * Operator landing page after SSO. Real /admin surfaces ship in Tasks
 * 27–30 (customers, states, PRA, support). For now this confirms the
 * session is established and shows what a Task 25+ Impersonate flow
 * will look like from the operator side.
 *
 * If session is missing, the parent layout already replaces the page
 * with the operator-session-required message — control only reaches
 * here with a valid session.
 */
export default async function AdminDashboardPage() {
  const session = (await getAdminSession()) ?? null;

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Foretab /admin
        </h1>
        <p className="text-sm text-muted-foreground">
          Operator session active. Real /admin surfaces ship in Tasks 27–30.
        </p>
      </header>

      <section className="space-y-2 rounded-md border border-input bg-muted/40 p-4">
        <h2 className="text-sm font-medium">Session</h2>
        <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-sm">
          <dt className="text-muted-foreground">Operator</dt>
          <dd>{session?.operator_email ?? "—"}</dd>
          <dt className="text-muted-foreground">HQ operator id</dt>
          <dd className="font-mono text-xs">{session?.operator_id ?? "—"}</dd>
          <dt className="text-muted-foreground">Origin jti</dt>
          <dd className="font-mono text-xs">{session?.origin_jti ?? "—"}</dd>
          <dt className="text-muted-foreground">Session expires</dt>
          <dd className="text-xs">
            {session?.exp
              ? new Date(session.exp * 1000).toLocaleString()
              : "—"}
          </dd>
        </dl>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Coming in Tasks 27–30</h2>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>• /admin/customers — search + detail + tier override + state grant edit</li>
          <li>• /admin/states — state activation toggles + data_source_health rollup</li>
          <li>• /admin/pra — PRA inbox + Carson/Mesquite review queue</li>
          <li>• /admin/support — customer suggestions + refunds</li>
          <li>• /admin/audit — gate_rejections + csv_export_log + billing_events</li>
        </ul>
      </section>

      <section className="space-y-2 rounded-md border border-input bg-muted/40 p-4">
        <h2 className="text-sm font-medium">End operator session</h2>
        <p className="text-xs text-muted-foreground">
          Clears the foretab_admin_session cookie. Bookmarking /admin
          without re-SSOing afterwards returns you to the session-required
          message — re-establish via HQ.
        </p>
        <form action="/admin/sign-out" method="post">
          <button
            type="submit"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            Sign out of /admin
          </button>
        </form>
      </section>
    </main>
  );
}
