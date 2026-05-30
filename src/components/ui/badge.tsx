import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal Badge primitive — no Radix dependency. Used for tier label,
 * trial countdown, signal-strength pills, and any small status chip.
 *
 * Existing variant API preserved: default | brand | hot | warm | cold |
 * urgent | outline. Restyled to use the new tokens and a Geist Mono
 * cap-letterform — badges read as machine output (tabular, deliberate),
 * matching the brand sheet's mono-eyebrow pattern.
 *
 * Variants:
 *   - default: neutral surface-2 — generic tag
 *   - brand:   accent fill — primary state / "Live" / tier highlight
 *   - hot:     destructive-tinted — high-intent licensing signal
 *   - warm:    warning-tinted — medium-intent / approaching cutoff
 *   - cold:    muted-text outline — low-intent / archived
 *   - urgent:  solid destructive — trial-expiry, errors
 *   - outline: bordered-only — placeholders, "coming soon"
 *   - soft:    accent-tint — secondary accent mention (e.g. tier chip)
 *
 * `soft` is new — useful for inline accent mentions that don't warrant
 * the full filled `brand` treatment.
 *
 * SPOTLIGHT overlay (visual only): pill radius (rounded-full) to match
 * the marketing chip style. Variant API and callers unchanged.
 */
type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?:
    | "default"
    | "brand"
    | "hot"
    | "warm"
    | "cold"
    | "urgent"
    | "outline"
    | "soft";
};

const VARIANT_CLASSES: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-secondary text-foreground-2",
  brand: "bg-primary text-primary-foreground",
  hot: "bg-destructive-tint text-destructive",
  warm: "bg-warning-tint text-warning",
  cold: "bg-secondary text-foreground-muted",
  urgent: "bg-destructive text-destructive-foreground",
  outline: "border border-input bg-transparent text-foreground-muted",
  soft: "bg-accent-tint text-primary",
};

export function Badge({
  variant = "default",
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        // Geist Mono · uppercase · tracked — reads as machine output.
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium uppercase leading-snug tracking-[0.06em]",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
