/**
 * Disposition layer — visual components (Claude Design).
 *
 * Re-skin of the design-exploration feature pack to the Foretab design
 * system (PRs 1–3 tokens + primitives), built against Code Agent B's merged
 * data contract (src/lib/disposition/types.ts). Visual layer only — no
 * data-layer logic; persistence goes through the contract's server actions.
 *
 * Mount points (wired by the dashboard page / RecordCard — Agent C's files):
 *   <DensityProvider>            wraps the worklist; useDensity() reads it
 *     <TodayPanel />             pinned above the list
 *     <StatusTabs />             filter row
 *     <RecentlyViewed />         last-opened rail
 *     RecordCard → <DispositionRow />   strip on each card base
 *     <DetailPanel />            slide-over
 *     <Insights />               charts panel
 */

export { DispositionRow } from "./disposition-row";
export { DetailPanel } from "./detail-panel";
export { StatusTabs, type StatusTabValue } from "./status-tabs";
export { TodayPanel } from "./today-panel";
export { RecentlyViewed } from "./recently-viewed";
export { Insights } from "./insights";
export {
  DensityProvider,
  DensityToggle,
  useDensity,
  type Density,
} from "./density-provider";

// Shared building blocks
export { SignalTier, SignalReason, SignalIcon } from "./signal-tier";
export { ActivityTimeline } from "./activity-timeline";
export {
  StatusDot,
  StatusPill,
  StatusPickerStack,
  LostReasonPicker,
} from "./status-picker";
export {
  STATUS_VISUAL,
  SIGNAL_VISUAL,
  SKIP_TAB_LABEL,
  type StatusVisual,
  type SignalVisual,
} from "./status-meta";
