import { ResetPasswordConfirmForm } from "@/components/auth/reset-password-confirm-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Set new password",
};

export default function ResetPasswordConfirmPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>
          Choose a new password. At least 8 characters, with upper, lower, and a number.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordConfirmForm />
      </CardContent>
    </Card>
  );
}
