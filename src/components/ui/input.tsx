import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Input primitive. API unchanged — same props as the existing one.
 *
 * Styling notes:
 *   - bg-card instead of bg-background, so the input sits as an
 *     elevated surface on top of the page background. In dark mode:
 *     #11151F input on #0A0E1A page. In light mode: #FFFFFF input on
 *     warm-paper page. Either way, the field reads as "fillable."
 *   - hover:border-surface-3 — softens the click affordance without
 *     committing to a focus state.
 *   - focus-visible uses accent border + 3px accent-ring (matches the
 *     direction doc spec; previous shadcn pattern used ring-2 +
 *     ring-offset-2 which doubles the visual weight).
 *   - placeholder uses --color-foreground-subtle (the deepest muted)
 *     so placeholders don't compete with real values.
 *
 * The Scene overlay: bg-secondary so inputs sit one surface step below
 * their card container — inset affordance in dark mode, slightly recessed
 * in light mode. Hover lifts the border to foreground-subtle so there's
 * a clear "active" signal before focus. Radius matches --radius-lg (6px).
 */
const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-lg border border-input bg-secondary px-3.5 py-2 text-[15px] font-normal tracking-[-0.005em] text-foreground placeholder:text-foreground-subtle transition-colors hover:border-foreground-subtle focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--color-accent-ring)] disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
