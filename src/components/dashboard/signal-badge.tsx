import type { SignalStrength } from "@/lib/dashboard/types";
import { SignalTier } from "./disposition/signal-tier";

/**
 * SignalBadge is now a one-line wrapper around the shared SignalTier from
 * Design's disposition layer — the broadcast-node + ripple-count visual
 * language. Same `signal` prop as before; every existing caller still works.
 *
 * The legacy hot|warm|cold Badge variants stay in badge.tsx for any non-
 * signal use; signal rendering converges on SignalTier so the worklist
 * card, the DispositionRow strip, the detail header, the Today panel, and
 * RecentlyViewed all match.
 */
export function SignalBadge({ signal }: { signal: SignalStrength | null }) {
  return <SignalTier signal={signal} />;
}
