import { cn } from "@/lib/utils";
import type { SignalStrength } from "@/lib/disposition/types";

/**
 * Signal-tier visual language — the broadcast-node + ripple-count system.
 *
 * signal_strength is literally a signal, so the icon is a source emitting
 * ripples; the ripple COUNT encodes the tier (shape carries the meaning, so
 * it's colorblind-safe). The accent-intensity tint only reinforces.
 *
 *   New          solid node + 2 ripples   "broadcasting strong — act now"
 *   Established   solid node + 1 ripple    "steady hum — known quantity"
 *   Dormant       solid node, no ripples   "gone quiet — low priority"
 *   null/Unrated  dashed ring              "no signal on file"
 *
 * Small-size tuned: cores are solid and ring spacing is wide so 2-vs-1-vs-0
 * resolves down to the 13px worklist row size; Dormant is the heaviest
 * (filled) node so "0 ripples" never reads as a faint smudge.
 *
 * This is the SINGLE primitive for both surfaces — the disposition layer
 * and Agent C's dashboard SignalBadge (which becomes a one-line wrapper).
 */

/** Bare glyph. Color comes from the parent (currentColor); size from `className`. */
export function SignalIcon({
  signal,
  className,
}: {
  signal: SignalStrength | null;
  className?: string;
}) {
  const common = {
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    className: cn("h-[13px] w-[13px] shrink-0", className),
    "aria-hidden": true as const,
  };

  if (signal === "New") {
    return (
      <svg {...common} strokeLinecap="round">
        <circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="none" />
        <circle cx="8" cy="8" r="5.2" />
        <circle cx="8" cy="8" r="7.2" />
      </svg>
    );
  }
  if (signal === "Established") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="none" />
        <circle cx="8" cy="8" r="5.6" />
      </svg>
    );
  }
  if (signal === "Dormant") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="3.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  // null → Unrated: dashed ring (state unknown, distinct from Dormant by stroke)
  return (
    <svg {...common} strokeDasharray="2 2.2">
      <circle cx="8" cy="8" r="5.6" />
    </svg>
  );
}

/** Icon-only color per tier — accent for New/Established, muted ramp below. */
const ICON_TONE: Record<SignalStrength, string> = {
  New: "text-primary",
  Established: "text-primary",
  Dormant: "text-foreground-muted",
};

/** Chip treatment (icon + label) per the accent-intensity ramp. */
const CHIP: Record<SignalStrength, string> = {
  New: "bg-accent text-accent-foreground",
  Established: "bg-accent-tint text-primary",
  Dormant: "border border-border bg-transparent text-foreground-muted",
};

/**
 * SignalTier — the tier indicator. Two modes:
 *   default      icon + label chip (roomy surfaces: detail, Today, legend)
 *   iconOnly     just the glyph with an accessible label (dense worklist,
 *                card corner) — keeps the row uncluttered
 */
export function SignalTier({
  signal,
  iconOnly = false,
  className,
}: {
  signal: SignalStrength | null;
  iconOnly?: boolean;
  className?: string;
}) {
  const label = signal ?? "Unrated";

  if (iconOnly) {
    return (
      <span
        role="img"
        aria-label={`Signal: ${label}`}
        title={label}
        className={cn(
          "inline-flex items-center justify-center",
          signal ? ICON_TONE[signal] : "text-foreground-subtle",
          className,
        )}
      >
        <SignalIcon signal={signal} className="h-[15px] w-[15px]" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5",
        "font-mono text-[10px] font-medium uppercase leading-snug tracking-[0.06em]",
        signal ? CHIP[signal] : "border border-border bg-transparent text-foreground-subtle",
        className,
      )}
    >
      <SignalIcon signal={signal} />
      {label}
    </span>
  );
}

/**
 * The "why this tier" caption. Always-visible, inline — same source string
 * (`signal_strength_reason`), same affordance Agent C ships on the card
 * (no tooltips: they fail on touch + screen readers).
 */
export function SignalReason({
  signal,
  reason,
  className,
}: {
  signal: SignalStrength | null;
  reason: string | null;
  className?: string;
}) {
  if (!reason) return null;
  return (
    <p
      className={cn(
        "max-w-prose text-xs leading-relaxed tracking-[-0.005em] text-foreground-muted",
        className,
      )}
    >
      {signal ? <span className="text-foreground-2">Why {signal} — </span> : null}
      {reason}
    </p>
  );
}
