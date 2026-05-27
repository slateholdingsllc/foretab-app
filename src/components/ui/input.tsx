import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Input primitive. API unchanged — same props as the existing one.
 *
 * Styling notes:
 *   - bg-card instead of bg-background, so the input sits as an
 *     elevated surface on top of the page background. In dark mode:
 *     #11151F input on #0A0E1A page. In light mode: #FFFFFF input on
 *     #F6F7F9 page. Either way, the field reads as "fillable."
 *   - hover:border-surface-3 — softens the click affordance without
 *     committing to a focus state.
 *   - focus-visible uses accent border + 3px accent-ring (matches the
 *     direction doc spec; previous shadcn pattern used ring-2 +
 *     ring-offset-2 which doubles the visual weight).
 *   - placeholder uses --color-foreground-subtle (the deepest muted)
 *     so placeholders don't compete with real values.
 */
const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm font-normal tracking-[-0.005em] text-foreground placeholder:text-foreground-subtle transition-colors hover:border-surface-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--color-accent-ring)] disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
