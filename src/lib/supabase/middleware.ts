import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Middleware Supabase client. Used by src/middleware.ts to refresh the
 * user's auth token on every request and gate access to protected routes.
 *
 * Returns the NextResponse that the middleware should return — which may
 * have updated auth cookies attached.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refresh the session — call getUser() to force token refresh if needed.
  // Per @supabase/ssr docs: do NOT remove this between createServerClient
  // and the return statement.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Route gating: unauthenticated users get redirected to /login when they
  // try to access protected routes. Public auth routes stay accessible.
  // /admin is excluded from customer-Supabase-Auth gating — the (admin)
  // route group enforces its own operator session via cookie established by
  // /admin/sso/start. See src/lib/admin-session/index.ts.
  const publicPaths = [
    "/login",
    "/signup",
    "/verify-email",
    "/reset-password",
    "/auth/callback",
    "/auth/finalize",
    "/admin",
  ];
  const isPublic = publicPaths.some(
    (p) => request.nextUrl.pathname === p || request.nextUrl.pathname.startsWith(p + "/"),
  );
  const isRoot = request.nextUrl.pathname === "/";

  if (!user && !isPublic && !isRoot) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
