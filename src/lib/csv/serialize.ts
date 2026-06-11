import type { DashboardRecord } from "@/lib/dashboard/types";
import { getRecordSourceLabel } from "@/lib/dashboard/state-display";
import { getAttributionsForStates } from "@/lib/state-attributions";

/**
 * CSV column layout for Task 17 exports. Stable order — changing this is
 * a customer-visible contract (their downstream spreadsheets reference
 * columns by position). When new columns need to ship, append to the end.
 *
 * Mirrors the dashboard card fields and adds the source label so
 * customers can attribute records back to their state agency.
 */
const COLUMNS = [
  "classified_at",
  "state",
  "license_record_type",
  "business_legal_name",
  "business_dba_name",
  "address",
  "city",
  "zip",
  "business_archetype",
  "beverage_scope",
  "on_premises",
  "off_premises",
  "signal_strength",
  "signal_strength_reason",
  "icp_relevance",
  "source",
  "notes",
  "customer_status",
  "disposition_status",
] as const;

/**
 * Excel-safe CSV escape. Wraps any field containing comma, quote, newline,
 * or carriage return in double quotes and doubles internal quotes per
 * RFC 4180. Leading =/+/-/@ are prefixed with a single quote to disarm
 * formula injection — Excel evaluates these as formulas when the field
 * starts with one and the cell is opened without protection.
 */
function csvField(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  const s = String(raw);
  if (s.length === 0) return "";

  const firstChar = s.charCodeAt(0);
  // = + - @ → 0x3D 0x2B 0x2D 0x40. Tab and CR also exploit some clients.
  const formulaPrefix =
    firstChar === 0x3d ||
    firstChar === 0x2b ||
    firstChar === 0x2d ||
    firstChar === 0x40 ||
    firstChar === 0x09 ||
    firstChar === 0x0d;

  const value = formulaPrefix ? `'${s}` : s;

  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function recordRow(r: DashboardRecord): string[] {
  const business = r.business;
  const location = r.location;
  const addressStreet = location?.street ?? location?.normalized_address ?? "";
  const source = getRecordSourceLabel({
    stateCode: r.state_code,
    dataSourceChannel: r.data_source_channel,
  });

  return [
    r.classified_at,
    r.state_code ?? "",
    r.license_record_type ?? "",
    business?.primary_legal_name ?? r.business_name ?? "",
    business?.primary_dba_name ?? r.dba_name ?? "",
    addressStreet,
    location?.city ?? "",
    location?.zip ?? "",
    r.business_archetype ?? "",
    r.beverage_scope ?? "",
    r.on_premises === null ? "" : r.on_premises ? "true" : "false",
    r.off_premises === null ? "" : r.off_premises ? "true" : "false",
    r.signal_strength ?? "",
    r.signal_strength_reason ?? "",
    r.icp_relevance.join("; "),
    source,
    r.notes ?? "",
    r.customer_status ?? "",
    r.disposition?.status ?? "",
  ];
}

/**
 * Serialize records to a CSV string per RFC 4180. Includes a UTF-8 BOM
 * so Excel for Windows displays non-ASCII characters correctly without
 * the user picking an import encoding.
 */
export function serializeRecordsToCsv(records: DashboardRecord[]): string {
  const lines = [COLUMNS.join(",")];
  for (const r of records) {
    lines.push(recordRow(r).map(csvField).join(","));
  }

  // Append verbatim state-required attribution text for any states whose
  // data source terms mandate a disclaimer when republishing. Each entry
  // occupies its own row after a blank separator, with a label in column A
  // and the full required text in column B.
  const attributions = getAttributionsForStates(records.map((r) => r.state_code));
  if (attributions.length > 0) {
    lines.push(""); // blank separator row
    for (const attr of attributions) {
      lines.push(
        csvField(`Data source attribution (${attr.source})`) +
          "," +
          csvField(attr.text),
      );
    }
  }

  return `﻿${lines.join("\r\n")}\r\n`;
}

/**
 * Returns a filename like `foretab-export-2026-05-26.csv`. Date is the
 * server date at export time. No filter fingerprint in the name —
 * customers re-export frequently and unique-suffix bloats their downloads
 * folder; their browser handles the (1), (2) suffix collision.
 */
export function buildCsvFilename(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `foretab-export-${y}-${m}-${d}.csv`;
}
