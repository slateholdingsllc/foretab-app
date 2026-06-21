import type { SignalStrength } from "@/lib/disposition/types";

export type TierDoc = {
  signal: SignalStrength;
  urgency: string;
  rule: string;
  salesContext: string;
};

export const TIER_DOCS: TierDoc[] = [
  {
    signal: "New",
    urgency: "Act first",
    rule: "A freshly issued license with little or no prior filing history at the address — a venue about to open or just opened.",
    salesContext: "Highest urgency. First contact before anyone else knows it exists.",
  },
  {
    signal: "Established",
    urgency: "Considered pitch",
    rule: "A license with a steady renewal record — an operating business, a known quantity worth a thoughtful approach.",
    salesContext: "Warm, durable. Worth a tailored pitch, not a cold blast.",
  },
  {
    signal: "Dormant",
    urgency: "Low priority",
    rule: "A license that's gone quiet — no recent filing activity, possibly winding down or temporarily lapsed.",
    salesContext: "Skip-eligible unless you have a specific reason to pursue.",
  },
];
