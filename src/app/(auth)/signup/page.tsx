import Link from "next/link";
import { SignupGate } from "@/components/auth/signup-gate";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Sign up",
};

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Start your Foretab trial</CardTitle>
        <CardDescription>
          Seven days, full single-state access. No credit card.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SignupGate />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
