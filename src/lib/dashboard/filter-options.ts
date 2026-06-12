/**
 * Shared filter option lists — single source of truth for the labels and
 * values used by both the desktop sidebar FilterForm and the mobile
 * FilterSheet. Extracted from filter-form.tsx verbatim so the two surfaces
 * can never drift. (filter-form.tsx may import from here to dedupe; not
 * required for this change to compile.)
 *
 * Values match the data contract exactly:
 *   - LicenseRecordType, SignalStrength (v2 vocab), BusinessArchetype, SortOrder
 *     from @/lib/dashboard/types
 */
import type {
  BusinessArchetype,
  LicenseRecordType,
  SignalStrength,
  SortOrder,
} from "@/lib/dashboard/types";

export const LICENSE_TYPE_OPTIONS: Array<{ value: LicenseRecordType; label: string }> = [
  { value: "new_issuance", label: "New issuance" },
  { value: "renewal", label: "Renewal" },
  { value: "transfer", label: "Transfer" },
  { value: "expiration", label: "Expiration" },
  { value: "suspension", label: "Suspension" },
  { value: "revocation", label: "Revocation" },
  { value: "application", label: "Application" },
];

// v2 vocab — values match classified_records.signal_strength. Display = value.
export const SIGNAL_OPTIONS: Array<{ value: SignalStrength; label: string }> = [
  { value: "New", label: "New" },
  { value: "Established", label: "Established" },
  { value: "Dormant", label: "Dormant" },
];

export const ARCHETYPE_OPTIONS: Array<{ value: BusinessArchetype; label: string }> = [
  { value: "bar_tavern", label: "Bar / Tavern" },
  { value: "restaurant_full_service", label: "Restaurant (full-service)" },
  { value: "restaurant_quick_serve", label: "Restaurant (quick-serve)" },
  { value: "package_store", label: "Package store" },
  { value: "grocery", label: "Grocery" },
  { value: "convenience", label: "Convenience" },
  { value: "hotel_lodging", label: "Hotel / lodging" },
  { value: "brewery", label: "Brewery" },
  { value: "winery", label: "Winery" },
  { value: "distillery", label: "Distillery" },
  { value: "wholesaler", label: "Wholesaler" },
  { value: "importer", label: "Importer" },
  { value: "club", label: "Club" },
  { value: "special_event", label: "Special event" },
  { value: "other", label: "Other" },
];

export const DAYS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 180 days" },
  { value: "365", label: "Last year" },
];

export const SORT_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: "newest_first", label: "Newest first" },
  { value: "oldest_first", label: "Oldest first" },
  { value: "name_asc", label: "Business name A→Z" },
  { value: "name_desc", label: "Business name Z→A" },
  { value: "issued_desc", label: "Recently issued" },
  { value: "issued_asc", label: "Oldest issued" },
  { value: "expiring_soonest", label: "Expiring soonest" },
  { value: "license_type_asc", label: "License type A→Z" },
  { value: "license_type_desc", label: "License type Z→A" },
];

/** Lookup helpers — label for a stored value, used by the chip row. */
export function licenseTypeLabel(v: string): string {
  return LICENSE_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
}
export function archetypeLabel(v: string): string {
  return ARCHETYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
}
export function daysLabel(v: number | null): string {
  if (v === null) return "All time";
  return DAYS_OPTIONS.find((o) => o.value === String(v))?.label ?? `Last ${v} days`;
}
export function sortLabel(v: string): string {
  return SORT_OPTIONS.find((o) => o.value === v)?.label ?? v;
}
