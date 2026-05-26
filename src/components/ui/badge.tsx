import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal Badge primitive — no Radix dependency. Used for tier label,
 * trial countdown, signal-strength pills, and any small status chip.
 *
 * Variants:
 *   - default: neutral graphite
 *   - brand:   Foretab electric blue (#2A7BFF surface)
 *   - hot:     warm red — high-intent licensing signal
 *   - warm:    amber — medium-intent
 *   - cold:    cool gray — low-intent
 *   - urgent:  alert red for trial-expiry countdowns
 *   - outline: bordered, no fill (for placeholders and "coming soon")
 */
type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "brand" | "hot" | "warm" | "cold" | "urgent" | "outline";
};

const VARIANT_CLASSES: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-secondary text-secondary-foreground",
  brand: "bg-primary text-primary-foreground",
  hot: "bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-100",
  warm: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100",
  cold: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  urgent: "bg-red-600 text-white",
  outline: "border border-input bg-transparent text-muted-foreground",
};

export function Badge({ variant = "default", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
