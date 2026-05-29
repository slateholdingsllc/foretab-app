/**
 * Visual metadata for the disposition layer — Claude Design's token shadow
 * of the data-layer's STATUS_META / LOST_REASONS.
 *
 * The contract (src/lib/disposition/types.ts) ships STATUS_META with raw hex
 * (#B4B2A9, #378ADD, …) and explicitly invites the visual layer to override
 * colors/labels by shadowing the constant here. This module is that shadow:
 * it maps every DispositionStatus + SignalStrength to design-system token
 * classes (Tailwind utilities resolving through globals.css `var(--color-*)`),
 * so both themes work with zero hardcoded color.
 *
 * We do NOT edit the contract — labels are re-derived from STATUS_META where
 * they match, and the dot/text treatments are ours.
 */

import type { DispositionStatus, SignalStrength } from "@/lib/disposition/types";
import { STATUS_META, LOST_REASONS } from "@/lib/disposition/types";

export type StatusVisual = {
  label: string;
  /** Tailwind classes for the status text color. */
  text: string;
  /** Tailwind classes for the status dot (a 8px circle). */
  dot: string;
};

/**
 * Engagement ramp: neutral (uncontacted) → accent ring (saved) →
 * accent fill (working) → success (won) / destructive (lost) → muted
 * outline (skip). Won/Lost own the semantic colors; the signal tier
 * (signal-tier.tsx) deliberately spends none of them.
 */
export const STATUS_VISUAL: Record<DispositionStatus, StatusVisual> = {
  uncontacted: {
    label: STATUS_META.uncontacted.label,
    text: "text-foreground-muted",
    dot: "bg-foreground-subtle",
  },
  saved: {
    label: STATUS_META.saved.label,
    text: "text-primary",
    dot: "border-2 border-accent bg-transparent",
  },
  working: {
    label: STATUS_META.working.label,
    text: "text-primary",
    dot: "bg-accent",
  },
  won: {
    label: STATUS_META.won.label,
    text: "text-success",
    dot: "bg-success",
  },
  lost: {
    label: STATUS_META.lost.label,
    text: "text-destructive",
    dot: "bg-destructive",
  },
  skip: {
    label: STATUS_META.skip.label,
    text: "text-foreground-subtle",
    dot: "border-[1.5px] border-foreground-subtle bg-transparent",
  },
};

/** The muted tab at the end of StatusTabs reads "Skipped", though the
 *  status label is "Skip" (per the contract comment). */
export const SKIP_TAB_LABEL = "Skipped";

export type SignalVisual = {
  /** Wrapper classes — the full accent-intensity treatment. */
  chip: string;
  /** Dot classes. */
  dot: string;
};

/**
 * Single-hue accent-intensity ramp. New = filled accent, Established =
 * accent tint, Dormant = muted outline. Labels are the values themselves
 * (already display-grade per the v2 rename).
 */
export const SIGNAL_VISUAL: Record<SignalStrength, SignalVisual> = {
  New: {
    chip: "bg-accent text-accent-foreground",
    dot: "bg-accent-foreground",
  },
  Established: {
    chip: "bg-accent-tint text-primary",
    dot: "border-2 border-accent bg-transparent",
  },
  Dormant: {
    chip: "border border-border bg-transparent text-foreground-muted",
    dot: "border-[1.5px] border-foreground-subtle bg-transparent",
  },
};

export { LOST_REASONS };
