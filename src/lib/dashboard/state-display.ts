import { getStateName } from "@/lib/constants";
import type { DataSourceChannel } from "./types";

/**
 * NEVER display "michigan.gov" as Michigan's source — MI data flows via
 * FOIA through the PRR pipeline (Agent A's PR-5 cohort). Customer-
 * facing source string for MI is "Michigan ABC, via PRR" regardless
 * of channel column.
 *
 * For other states, the source string is derived from
 * data_source_channel when present, otherwise the state's full name.
 *
 * The reserved channel column is null until Agent A adds it to
 * classified_records (foretab-engine, future task). Until then, every
 * card's source line shows the state name except MI which always shows
 * the PRR string.
 */

export function getRecordSourceLabel(args: {
  stateCode: string | null;
  dataSourceChannel: DataSourceChannel | null;
}): string {
  const stateCode = args.stateCode?.toUpperCase() ?? "";

  // MI special case — never reveal the .gov source; always PRR framing
  if (stateCode === "MI") {
    return "Michigan ABC, via PRR";
  }

  const stateName = getStateName(stateCode) ?? stateCode ?? "Unknown state";

  if (!args.dataSourceChannel) {
    return stateName;
  }

  // Once data_source_channel is live, refine the per-state string here.
  // For now, return state name + a generic channel tag derived from the
  // enum. Replace this with per-state, per-channel canonical strings
  // when the channel-discipline audit (gate item 5) defines them.
  switch (args.dataSourceChannel) {
    case "socrata_api":
      return `${stateName}, via Socrata`;
    case "pdf_parse":
      return `${stateName}, via PDF`;
    case "web_scrape":
      return `${stateName}, via direct fetch`;
    case "prr_request":
      return `${stateName}, via PRR`;
    case "foia_request":
      return `${stateName}, via FOIA`;
    default:
      return stateName;
  }
}

/**
 * NV customer-facing scope description. Nine distinct licensing
 * authorities (verified 2026-06-12): Las Vegas, Clark County, Reno,
 * Washoe County, Sparks, Henderson, North Las Vegas, NV Department of
 * Taxation, Douglas County. The word "majority" is forbidden (denominator
 * isn't externally verifiable).
 *
 * Use the long form on first mention (signup-flow context); use the
 * short form anywhere it appears repeatedly (filter labels, etc.).
 */
export const NV_SCOPE_LONG = "Nevada's nine licensing authorities";
export const NV_SCOPE_SHORT =
  "Las Vegas, Reno, Henderson, Clark County, and five other Nevada jurisdictions";

/**
 * Display label for a state in customer-facing UI (filter pills, card
 * headers, etc.). NV gets a footnote-style augment since just "Nevada"
 * undersells the actual scope.
 */
export function getStateDisplayLabel(stateCode: string): string {
  const code = stateCode.toUpperCase();
  if (code === "NV") return "Nevada (9 jurisdictions)";
  return getStateName(code) ?? code;
}
