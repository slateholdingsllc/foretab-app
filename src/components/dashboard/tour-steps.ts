/**
 * Guided-tour step config — the five first-login coachmarks.
 *
 * Each step anchors to a real element via `anchorId`, matched to a
 * `data-tour-id="…"` attribute C adds to the target. Keeping the config here
 * (data, not JSX) means the copy and order are editable without touching the
 * tour engine.
 *
 * Anchors (C stamps data-tour-id on these existing elements):
 *   today-panel     → <TodayPanel> root
 *   status-pill     → the first worklist row's disposition status pill
 *   saved-views     → the SavedFiltersMenu control (desktop) /
 *                     the "Filters" button → Views panel (mobile)
 *   nav-pipeline    → the Pipeline nav tab (added with the Pipeline route)
 *   account-menu    → the avatar / account button, top-right
 *
 * Missing anchors are auto-skipped by the engine, so a step whose target
 * isn't on the current page (e.g. the Pipeline tab before that route ships)
 * is silently passed over and the tour still completes.
 */

export type TourStep = {
  /** Matches data-tour-id on the target element. */
  anchorId: string;
  /** Step eyebrow, e.g. "Step 2 · Disposition a lead". */
  eyebrow: string;
  title: string;
  body: string;
  /** Preferred popover placement relative to the anchor. */
  placement: "top" | "bottom" | "left" | "right";
};

export const TOUR_STEPS: TourStep[] = [
  {
    anchorId: "today-panel",
    eyebrow: "Step 1 · Start here",
    title: "What needs you today",
    body: "Due follow-ups and fresh high-priority leads, surfaced the moment you log in. Clear this and you've worked your day.",
    placement: "left",
  },
  {
    anchorId: "status-pill",
    eyebrow: "Step 2 · Disposition a lead",
    title: "Work the list like a pipeline",
    body: "Set a status — Saved, Working, Won — right on the card. Add a note or a follow-up without leaving the row.",
    placement: "bottom",
  },
  {
    anchorId: "saved-views",
    eyebrow: "Step 3 · Save a custom view",
    title: "Filter once, return anytime",
    body: "Narrow the list by state, signal, type, or date — then save it as a view. Your territory and your hot segments are one click away, every login.",
    placement: "bottom",
  },
  {
    anchorId: "nav-pipeline",
    eyebrow: "Step 4 · See your pipeline",
    title: "Track how it's converting",
    body: "The Pipeline page shows your funnel, win rate by signal tier, and 30-day activity — all for your territory.",
    placement: "bottom",
  },
  {
    anchorId: "account-menu",
    eyebrow: "Step 5 · Make it yours",
    title: "Account & settings",
    body: "States, billing, theme, and sign-out live here. That's the tour — you're ready to work.",
    placement: "bottom",
  },
];

/** localStorage key — fallback gate until the user.has_completed_tour field lands. */
export const TOUR_STORAGE_KEY = "foretab.tour.completed.v1";
