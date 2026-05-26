import { Badge } from "@/components/ui/badge";

/**
 * Trial countdown badge. Renders in the top bar when the customer's
 * trial is active (trialExpiresAt is set). Color shifts to urgent at
 * <= 2 days remaining; outline placeholder when no trial (paid customer).
 *
 * Task 13 prep — when the trial flow ships its full lifecycle, this
 * component is the surface that customers see ticking down.
 */
export function TrialBadge({ trialExpiresAt }: { trialExpiresAt: string | null }) {
  if (!trialExpiresAt) {
    return null;
  }

  const expires = new Date(trialExpiresAt);
  const now = new Date();
  const msRemaining = expires.getTime() - now.getTime();
  const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

  if (daysRemaining <= 0) {
    return <Badge variant="urgent">Trial expired</Badge>;
  }
  if (daysRemaining <= 2) {
    return <Badge variant="urgent">{daysRemaining}d left</Badge>;
  }
  if (daysRemaining <= 5) {
    return <Badge variant="warm">{daysRemaining} days left</Badge>;
  }
  return <Badge variant="brand">Trial · {daysRemaining} days left</Badge>;
}
