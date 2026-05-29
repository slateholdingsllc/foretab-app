/**
 * Phase 3 CRM · disposition data contract.
 *
 * This file is the **shared read-only surface** for Claude Design (visual
 * components) and Code Agent C (surrounding customer-app surfaces). They
 * import from here; they do not edit here. If they need a type change they
 * request it through Britt — keeps the data contract from drifting.
 *
 * Mirrors the DB schema landed in foretab-engine migration
 * 20260528000002_phase2_crm_disposition_layer.sql.
 *
 * SignalStrength is intentionally left as `string` for now — Code Agent A's
 * v2 classification vocabulary (New/Established/Dormant, migration
 * 20260528000001_signal_strength_rename.sql) is the upstream source of
 * truth. When his enum is observable + v1 rows are backfilled, this file
 * gets a follow-up PR pinning the literal union. Keeping it loose here
 * means Code Agent C and Claude Design don't have to wait.
 */

// ============================================================================
// Enum + row types — mirror the DB
// ============================================================================

export type DispositionStatus =
  | "uncontacted" // rep has not touched this business (implicit default — no row)
  | "saved"       // bookmarked, will look later
  | "working"     // actively pursuing
  | "won"         // closed as account
  | "lost"        // pursued, did not close (lost_reason explains why)
  | "skip";       // not a fit, hidden from default tab

export type TouchKind = "call" | "email" | "meeting" | "note" | "other";

export type BusinessEventKind =
  | "status_change"
  | "note"
  | "follow_up_set"
  | "follow_up_cleared";

export type LostReason =
  | "pricing"
  | "timing"
  | "no_decision_maker"
  | "not_a_fit"
  | "competitor"
  | "other";

/**
 * Signal-strength v2 vocabulary lands in Code Agent A's migration
 * 20260528000001_signal_strength_rename.sql. Until that's observable and
 * v1 rows are backfilled (or the union of v1+v2 is locked), this stays
 * `string` to keep the data contract from blocking on cross-agent timing.
 */
export type SignalStrength = string;

// ============================================================================
// Row types — one per table
// ============================================================================

export interface BusinessDisposition {
  id: string;
  customer_id: string;
  business_id: string;
  status: DispositionStatus;
  notes: string | null;
  follow_up_at: string | null;
  last_touched_at: string | null;
  last_touch_kind: TouchKind | null;
  lost_reason: LostReason | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessDispositionEvent {
  id: string;
  customer_id: string;
  business_id: string;
  kind: BusinessEventKind;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface LicenseTouch {
  id: string;
  customer_id: string;
  business_id: string;
  classified_record_id: string;
  kind: TouchKind;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ViewedBusiness {
  id: string;
  customer_id: string;
  business_id: string;
  last_viewed_at: string;
  created_at: string;
}

// ============================================================================
// UI metadata
// ============================================================================
// Pack-equivalent defaults. Claude Design overrides colors / labels in her
// visual layer if needed — she imports from this module and shadows the
// constant in her component if she wants different styling. The defaults
// here are guard-rails, not edicts.

export const STATUS_META: Record<
  DispositionStatus,
  { label: string; color: string; description: string }
> = {
  uncontacted: {
    label: "Uncontacted",
    color: "#B4B2A9",
    description: "You haven't worked this yet",
  },
  saved: {
    label: "Saved",
    color: "#378ADD",
    description: "Bookmarked for later",
  },
  working: {
    label: "Working",
    color: "#EF9F27",
    description: "Actively pursuing",
  },
  won: {
    label: "Won",
    color: "#97C459",
    description: "Closed as account",
  },
  lost: {
    label: "Lost",
    color: "#E24B4A",
    description: "Didn't close",
  },
  skip: {
    label: "Skip",
    color: "#888780",
    description: "Not a fit, hidden from default views",
  },
};

export const LOST_REASONS: Record<LostReason, string> = {
  pricing: "Too expensive",
  timing: "Bad timing",
  no_decision_maker: "Couldn't reach decision-maker",
  not_a_fit: "Not a fit",
  competitor: "Chose competitor",
  other: "Other",
};

export const STATUS_PICKER_ORDER: DispositionStatus[] = [
  "uncontacted",
  "saved",
  "working",
  "won",
  "lost",
  "skip",
];

/**
 * Tabs above the worklist. Skip is intentionally OMITTED from this list —
 * the StatusTabs component renders the muted "Skipped" tab separately at
 * the end of the row so dismissed records stay discoverable without
 * cluttering the primary filter row.
 */
export const STATUS_TAB_ORDER: DispositionStatus[] = [
  "uncontacted",
  "saved",
  "working",
  "won",
  "lost",
];

// ============================================================================
// Activity timeline — UNION ALL shape
// ============================================================================
// The DetailPanel renders one chronological timeline that merges
// BusinessDispositionEvent + LicenseTouch. Both row types share a `kind`
// column, so the discriminator below tells the renderer which schema the
// row follows.

export type ActivityTimelineRow =
  | ({ source: "business_event" } & BusinessDispositionEvent)
  | ({ source: "license_touch" } & LicenseTouch);

// ============================================================================
// View-model types used by the dashboard list + Today panel + Recently viewed
// ============================================================================

/**
 * A classified_record row enriched with the customer's disposition (when
 * the rep has touched the parent business) and the resolved business
 * display name. The dashboard list renders these.
 */
export interface DispositionListRow {
  classified_record_id: string;
  business_id: string;
  display_name: string;             // COALESCE(businesses.primary_dba_name, primary_legal_name, '—')
  state_code: string | null;
  signal_strength: SignalStrength | null;
  classified_at: string | null;
  disposition: BusinessDisposition | null;
}

export interface DueFollowUp {
  disposition_id: string;
  business_id: string;
  display_name: string;
  follow_up_at: string;
  signal_strength: SignalStrength | null;
}

export interface NewHighPriorityLead {
  business_id: string;
  display_name: string;
  state_code: string | null;
  signal_strength: SignalStrength | null;
  /** classified_records.created_at of the most recent qualifying event. */
  surfaced_at: string;
}

export interface RecentlyViewedBusinessRow {
  business_id: string;
  display_name: string;
  signal_strength: SignalStrength | null;
  last_viewed_at: string;
}

// ============================================================================
// Insights panel — aggregate shapes
// ============================================================================
// Funnel + win-rate counts are **distinct-business** at every stage, not
// disposition-row counts. A business with five license events that the
// rep has dispositioned counts as 1 in every stage. Matches "businesses
// I'm working" semantics, not "events I touched."

export interface DispositionFunnelData {
  /** Distinct businesses accessible to the customer (state-scope filtered). */
  surfaced: number;
  /** Distinct businesses with status IN (saved, working, won, lost). */
  saved: number;
  /** Distinct businesses with last_touched_at IS NOT NULL. */
  engaged: number;
  /** Distinct businesses with status = 'won'. */
  won: number;
}

export interface SignalWinRateRow {
  signal: SignalStrength;
  total: number; // distinct businesses with this signal in scope
  won: number;   // distinct businesses with this signal AND status='won'
}

export interface ActivityDay {
  date: string; // YYYY-MM-DD
  count: number;
}
