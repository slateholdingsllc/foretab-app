import { getAdminSession } from "@/lib/admin-session";

/**
 * /admin layout. Phase 3 Task 21.
 *
 * Enforces the operator session cookie on every /admin/* page. The
 * /admin/sso/start handler is a Route Handler (route.ts), not a page —
 * Next.js doesn't run page layouts for Route Handlers, so /admin/sso/start
 * is naturally reachable without a session (which is required, since
 * that's the route that ESTABLISHES the session).
 *
 * Customers should never land here. If an operator hits /admin without a
 * valid session (bookmarked the URL, cookie expired, etc.), we show a
 * clear message pointing back at HQ — not a redirect to customer /login.
 *
 * No chrome here yet (no nav, no badges). Chrome ships with the first
 * real operator surface in Task 27 (customers list + audit views).
 */

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();

  if (!session) {
    return (
      <main className="mx-auto max-w-xl space-y-4 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">
          Operator session required
        </h1>
        <p className="text-sm text-muted-foreground">
          /admin is reachable only via HQ-Slate SSO. If you are an
          operator, open{" "}
          <a
            href="https://hq.slateholdingsllc.com/t"
            className="underline underline-offset-2"
          >
            hq.slateholdingsllc.com/t
          </a>{" "}
          and click "Open admin" on the Foretab row.
        </p>
        <p className="text-xs text-muted-foreground">
          If you are a Foretab customer, this page is not for you — your
          dashboard is at{" "}
          <a href="/" className="underline underline-offset-2">
            app.foretab.com
          </a>
          .
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
