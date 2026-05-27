import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/**
 * Geist is the brand sans. Geist Mono is reserved for data — record
 * IDs, timestamps, classifier output, eyebrow/meta labels. Both load
 * once at the root and become Tailwind tokens via globals.css.
 */
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Foretab",
    template: "%s · Foretab",
  },
  description: "US state liquor license intelligence for B2B sales teams.",
  // metadataBase is the canonical site URL for OpenGraph + Twitter card URLs.
  // Distinct from auth-redirect origin (which is derived from request headers
  // per request — see src/lib/actions/auth.ts). NEXT_PUBLIC_SITE_URL is the
  // override for OG-only purposes; fallback is the production custom domain.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://app.foretab.com",
  ),
};

/**
 * FOUC-safe theme initialization. Runs synchronously inside <head>
 * BEFORE React hydrates, so the [data-theme] attribute is set on
 * <html> before any paint — no flash of wrong theme on cold loads.
 *
 * Resolution order:
 *   1. localStorage["foretab-theme"] = "light" | "dark"  → explicit choice
 *   2. window.matchMedia("prefers-color-scheme: light")   → system pref
 *   3. fall back to "dark"                                → brand default
 *
 * Wrapped in try/catch so a localStorage failure (private mode, etc.)
 * never blocks rendering. Errors swallowed — the dark fallback covers
 * the worst case.
 */
const themeInitScript = `(function(){try{var s=localStorage.getItem('foretab-theme');if(s==='light'||s==='dark'){document.documentElement.dataset.theme=s;return;}document.documentElement.dataset.theme=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning is required: the FOUC script writes
    // data-theme onto <html> before React hydrates, and React would
    // otherwise warn about the server/client attribute mismatch.
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: FOUC-safe theme init, see above */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
