import { Badge } from "@/components/ui/badge";
import type { SignalStrength } from "@/lib/dashboard/types";

// Display labels were renamed from Hot/Warm/Cold to New/Established/Dormant.
// DB enum values (hot|warm|cold) are unchanged — those are Agent A/B's
// contract. Badge variant strings are unchanged — those are color identity
// in the design system, not business semantics.
const LABELS: Record<SignalStrength, string> = {
  hot: "New",
  warm: "Established",
  cold: "Dormant",
};

export function SignalBadge({ signal }: { signal: SignalStrength | null }) {
  if (!signal) {
    return <Badge variant="outline">Unrated</Badge>;
  }
  return <Badge variant={signal}>{LABELS[signal]}</Badge>;
}
