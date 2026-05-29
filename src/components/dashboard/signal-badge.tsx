import { Badge } from "@/components/ui/badge";
import type { SignalStrength } from "@/lib/dashboard/types";

/**
 * SignalStrength (v2: New/Established/Dormant) is already display-grade, so
 * the value renders directly as the badge label. Variant is mapped here —
 * Badge primitive's `hot|warm|cold` are color identities in the design
 * system (destructive-tint / warning-tint / muted), not business semantics,
 * and stay untouched. The mapping below carries the same visual treatment
 * Task 2 shipped (New rendered as destructive-tint, etc.).
 */
const SIGNAL_TO_VARIANT: Record<SignalStrength, "hot" | "warm" | "cold"> = {
  New: "hot",
  Established: "warm",
  Dormant: "cold",
};

export function SignalBadge({ signal }: { signal: SignalStrength | null }) {
  if (!signal) {
    return <Badge variant="outline">Unrated</Badge>;
  }
  return <Badge variant={SIGNAL_TO_VARIANT[signal]}>{signal}</Badge>;
}
