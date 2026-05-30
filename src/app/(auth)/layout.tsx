import Link from "next/link";
import { BrandMark } from "@/components/ui/brand-mark";

/**
 * Auth layout — wraps signup, login, reset-password, verify-email pages.
 *
 * Renders the BrandMark + wordmark lockup centered above the page's
 * card content. Pages themselves keep using <Card> primitives; this
 * layout handles the brand chrome so individual page files stay focused
 * on form content.
 *
 * The lockup links to / — same affordance the dashboard TopBar provides.
 * Signed-out visitors hit the auth gate and land on /login (correct).
 * Signed-in visitors land on the dashboard (correct). Avoids requiring
 * the browser back button to escape an auth page.
 *
 * SPOTLIGHT overlay (visual only): the auth screen now matches the
 * marketing site — a warm, space-filling stage with a soft brand-blue
 * blob and amber accent behind a larger, scaling card. The lockup is
 * enlarged (size-9 mark, text-2xl wordmark) and the container widens
 * responsively (clamp via max-w + fluid padding) so the card owns its
 * space on large displays instead of floating small. No copy, routes,
 * or form logic changed — only chrome.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-10 sm:px-6">
      {/* Spotlight backdrop — decorative, behind everything. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full bg-accent opacity-[0.22] blur-[20px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 -left-24 h-[260px] w-[260px] rounded-full bg-amber opacity-[0.28] blur-[12px]"
      />

      <Link
        href="/"
        aria-label="Foretab home"
        className="relative z-10 mb-9 flex items-center gap-3 text-foreground transition-opacity hover:opacity-85"
      >
        <BrandMark className="size-9" />
        <span className="text-2xl font-semibold tracking-[-0.03em]">
          foretab
        </span>
      </Link>

      <div className="relative z-10 w-full max-w-[clamp(380px,46vw,540px)]">
        {children}
      </div>
    </main>
  );
}
