"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { resendVerification } from "@/lib/actions/auth";

export function VerifyEmailActions({ email }: { email: string }) {
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={pending || status === "sent"}
        onClick={() => {
          setStatus("idle");
          setErrorMsg(null);
          startTransition(async () => {
            const fd = new FormData();
            fd.set("email", email);
            const result = await resendVerification(fd);
            if (result.ok) setStatus("sent");
            else {
              setStatus("error");
              setErrorMsg(result.error);
            }
          });
        }}
      >
        {pending ? "Sending..." : status === "sent" ? "Sent — check your inbox" : "Resend verification email"}
      </Button>
      {status === "error" && errorMsg && (
        <Alert variant="destructive">
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
