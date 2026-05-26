import { Badge } from "@/components/ui/badge";
import type { SignalStrength } from "@/lib/dashboard/types";

const LABELS: Record<SignalStrength, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};

export function SignalBadge({ signal }: { signal: SignalStrength | null }) {
  if (!signal) {
    return <Badge variant="outline">Unrated</Badge>;
  }
  return <Badge variant={signal}>{LABELS[signal]}</Badge>;
}
