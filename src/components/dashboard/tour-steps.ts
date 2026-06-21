export type TourStep = {
  targetId: string;
  stepLabel: string;
  title: string;
  body: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    targetId: "today-panel",
    stepLabel: "Step 1 · Your briefing",
    title: "Start here every day",
    body: "Due follow-ups and fresh high-priority leads. These are the highest-leverage actions in your worklist.",
  },
  {
    targetId: "status-pill",
    stepLabel: "Step 2 · Disposition a lead",
    title: "Work the list like a pipeline",
    body: "Set a status — Saved, Working, Won — right on the card. Add a note or a follow-up without leaving the row.",
  },
  {
    targetId: "nav-pipeline",
    stepLabel: "Step 3 · Track your funnel",
    title: "Your pipeline health, at a glance",
    body: "Funnel stages, win rate by signal tier, and 30-day activity. Go here to reason about how your pipeline is moving.",
  },
  {
    targetId: "account-menu",
    stepLabel: "Step 4 · Settings",
    title: "Everything else lives here",
    body: "States, plan details, and sign-out. Won't need it often — but always findable.",
  },
];
