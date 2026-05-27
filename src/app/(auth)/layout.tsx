import { BrandMark } from "@/components/ui/brand-mark";

/**
 * Auth layout — wraps signup, login, reset-password, verify-email pages.
 *
 * Renders the BrandMark + wordmark lockup centered above the page's
 * card content. Pages themselves keep using <Card> primitives; this
 * layout handles the brand chrome so individual page files stay focused
 * on form content.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mb-8 flex items-center gap-2.5 text-foreground">
        <BrandMark className="size-7" />
        <span className="text-xl font-medium tracking-[-0.025em]">foretab</span>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
