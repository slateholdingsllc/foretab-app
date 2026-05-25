import { VerifyEmailActions } from "@/components/auth/verify-email-actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Check your email",
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const email = params.email ?? "";
  const masked = maskEmail(email);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          {email
            ? `We sent a verification link to ${masked}. Click it to finish setting up your account.`
            : "We sent a verification link. Click it to finish setting up your account."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {email && <VerifyEmailActions email={email} />}
        <p className="mt-4 text-xs text-muted-foreground">
          Link expires in 24 hours. If you don't see the email, check spam.
        </p>
      </CardContent>
    </Card>
  );
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local}***@${domain}`;
  return `${local[0]}${"*".repeat(Math.max(local.length - 2, 1))}${local[local.length - 1]}@${domain}`;
}
