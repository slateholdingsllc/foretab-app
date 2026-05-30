import Link from "next/link";
import { GoogleButton } from "@/components/auth/google-button";
import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Sign in",
};

/**
 * SPOTLIGHT overlay (visual only): the auth card is enlarged to match the
 * marketing-grade sign-in — centered header, larger title, and generous
 * fluid padding (p-8 → sm:p-10) so the box fills its space confidently
 * instead of reading as a small cramped card. Copy, routes, and form
 * logic are unchanged; only layout/spacing classes were added.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next || "/";

  return (
    <Card className="shadow-[var(--shadow-lg,0_18px_44px_rgba(0,0,0,0.4))]">
      <CardHeader className="items-center p-8 pb-3 text-center sm:p-10 sm:pb-3">
        <CardTitle className="text-3xl">Sign in to Foretab</CardTitle>
        <CardDescription className="text-[15px]">Welcome back.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-8 pt-2 sm:p-10 sm:pt-2">
        <GoogleButton next={next} />
        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-input" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>
        <LoginForm next={next} />
        <p className="text-center text-sm text-muted-foreground">
          No account yet?{" "}
          <Link href="/signup" className="text-primary hover:underline">
            Start a trial
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
