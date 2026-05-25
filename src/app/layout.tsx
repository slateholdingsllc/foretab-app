import type { Metadata } from "next";
import "./globals.css";

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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://app.foretab.com"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
