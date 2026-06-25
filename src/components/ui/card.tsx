import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card primitives. Existing slot API preserved (Card / CardHeader /
 * CardTitle / CardDescription / CardContent / CardFooter) so callers
 * continue to render correctly. Styling tightened against the brand
 * type system:
 *
 *   - Card body uses surface + 1px border + 6px radius (was lg radius
 *     + shadow-sm; the new ramp does the elevation work via surface
 *     color, no shadow needed).
 *   - CardTitle is text-lg (18px) Geist Medium with tight tracking —
 *     readable as a heading without the marketing-card "text-2xl
 *     semibold" weight.
 *   - CardTitle is explicitly `text-foreground` to enforce Britt's
 *     PR 1 review revision: section headings inside cards use --fg,
 *     never --fg-muted. (Inheritance already covers this, but the
 *     explicit class makes the rule visible in the source.)
 *   - CardDescription is the muted meta slot — `text-muted-foreground`
 *     is the right token for this.
 *
 * SPOTLIGHT overlay (visual only): card radius softened to rounded-xl
 * and CardTitle stepped up to text-xl to match the marketing site's
 * warmer, larger-type feel. Slot API and callers unchanged.
 */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border border-border bg-card text-card-foreground transition-colors",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-1.5 p-5", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

/**
 * CardTitle — primary-contrast heading. Card titles are load-bearing
 * text; never use --fg-muted or --fg-subtle here. Eyebrow / meta
 * variants belong in their own slots (CardDescription, or use a
 * mono-styled span explicitly).
 */
const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "text-xl font-medium leading-tight tracking-[-0.02em] text-foreground",
      className,
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground leading-relaxed", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center gap-2 p-5 pt-0 border-t border-border-soft",
      className,
    )}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
