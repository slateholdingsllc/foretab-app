/**
 * Per-state data attribution requirements. Keyed by state_code.
 *
 * Some states that publish data through their open-data portals require
 * a specific disclaimer to be displayed wherever their data is republished.
 * This map holds the verbatim required text and its source URL.
 *
 * CO is the only state at launch. Add entries here when new state data
 * sources impose similar requirements — the dashboard and CSV export paths
 * both derive their attribution display from this map automatically.
 */
export type StateAttribution = {
  /** Verbatim required disclaimer text from the data source's terms. */
  text: string;
  /** URL of the terms/license page this text was drawn from. */
  source: string;
};

export const STATE_ATTRIBUTIONS: Partial<Record<string, StateAttribution>> = {
  CO: {
    text: "The data made available here has been modified for use from its original source, which is the State of Colorado. THE STATE OF COLORADO MAKES NO REPRESENTATIONS OR WARRANTY AS TO THE COMPLETENESS, ACCURACY, TIMELINESS, OR CONTENT OF ANY DATA MADE AVAILABLE THROUGH THIS SITE. THE STATE OF COLORADO EXPRESSLY DISCLAIMS ALL WARRANTIES, WHETHER EXPRESS OR IMPLIED, INCLUDING ANY IMPLIED WARRANTIES OF MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE. The data is subject to change as modifications and updates are complete. It is understood that the information contained in the Web feed is being used at one's own risk.",
    source: "https://data.colorado.gov/terms",
  },
};

/**
 * Return deduplicated attributions for any state codes that have a
 * registered entry. Null codes are ignored; duplicates are collapsed.
 */
export function getAttributionsForStates(
  stateCodes: (string | null | undefined)[],
): StateAttribution[] {
  const seen = new Set<string>();
  const result: StateAttribution[] = [];
  for (const code of stateCodes) {
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const attr = STATE_ATTRIBUTIONS[code];
    if (attr) result.push(attr);
  }
  return result;
}
