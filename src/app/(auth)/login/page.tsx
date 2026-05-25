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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next || "/";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in to Foretab</CardTitle>
        <CardDescription>Welcome back.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
