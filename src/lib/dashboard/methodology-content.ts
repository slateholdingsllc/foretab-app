/**
 * Signal-tier methodology content — the "How Foretab signals work" explainer.
 *
 * Single source of truth for the three-tier copy. Rendered by
 * <SignalMethodology> (page + modal). Kept as data so the page, a modal off
 * the signal legend, and any marketing mirror stay identical.
 *
 * Tiers + the broadcast-node icon language match the shipped SignalStrength
 * vocab (New / Established / Dormant) and the SignalIcon component.
 */

export type MethodologyTier = {
  tier: "New" | "Established" | "Dormant";
  /** One-line rule for what the tier means. */
  rule: string;
  /** Why a rep acts on it — the practical read. */
  act: string;
};

export const METHODOLOGY_TIERS: MethodologyTier[] = [
  {
    tier: "New",
    rule: "A freshly issued license with little or no prior history at the address — a venue about to open or just opened.",
    act: "Highest urgency. First contact before anyone else knows it exists.",
  },
  {
    tier: "Established",
    rule: "A license with a steady renewal record — an operating business, a known quantity worth a considered approach.",
    act: "Warm and durable. Worth a tailored pitch, not a cold blast.",
  },
  {
    tier: "Dormant",
    rule: "A license that's gone quiet — no recent filing activity, possibly winding down or lapsed.",
    act: "Low priority. Skip-eligible unless you have a specific reason.",
  },
];

export const METHODOLOGY_KICKER = "How Foretab signals work";
export const METHODOLOGY_TITLE = "Every license gets a signal tier. Here's how.";
export const METHODOLOGY_LEDE =
  "We read each license's public filing history and classify how actionable it is right now. Three tiers, one rule each — and every record shows its own reason inline.";
export const METHODOLOGY_FOOTNOTE =
  "Tiers come from official state filing records only — no scraping, no guesswork. Every record carries its own one-line reason, so you always see the specific basis, not just the label.";
