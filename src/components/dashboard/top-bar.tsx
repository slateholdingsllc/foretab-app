import Link from "next/link";
import { signOut } from "@/lib/actions/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrialBadge } from "./trial-badge";

/**
 * Top bar of the dashboard chrome. Brand mark left; tier + trial badges
 * center-right; account link + email + sign-out right.
 *
 * No dropdown menu — flat inline links. The Account link is intentionally
 * top-level (not behind a menu) to satisfy the legal reviewer's parallel
 * principle: cancel/manage CTAs must be equally findable as upgrade CTAs.
 * The /account page houses subscription management, including cancel.
 */
export function TopBar({
  email,
  currentTier,
  trialExpiresAt,
}: {
  email: string | null;
  currentTier: string | null;
  trialExpiresAt: string | null;
}) {
  return (
    <header className="border-b border-input bg-card">
      <div className="flex h-14 items-center gap-4 px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="text-lg">Foretab</span>
        </Link>

        <div className="flex flex-1 items-center justify-end gap-3">
          {currentTier ? (
            <Badge variant="default" className="capitalize">
              {currentTier.replace(/_/g, " ")}
            </Badge>
          ) : null}

          <TrialBadge trialExpiresAt={trialExpiresAt} />

          {email ? (
            <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>
          ) : null}

          <Link
            href="/account"
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            Account
          </Link>

          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
