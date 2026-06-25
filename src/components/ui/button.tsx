import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Button primitive. Existing variant + size API preserved so every
 * caller in the app continues to work without edits — only styling
 * changes.
 *
 * Hover model: hue-shift, NOT opacity. Opacity-hover reads as
 * prototype-quality; hue-shift reads as intentional product design.
 * primary → bg-accent-hover (lighter on dark, deeper on light).
 * destructive → opacity drop, because there's no semantic "hover-red".
 *
 * Sizes: default (h-10), sm (h-9), lg (h-11), icon (square h-9).
 *
 * SPOTLIGHT overlay: buttons are pill-shaped (rounded-full) to match
 * the marketing CTAs — a visual-only change to the radius. Variant +
 * size API and every caller are untouched.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-sm font-medium tracking-[-0.005em] ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary action — accent fill, semibold weight, hue-shift hover.
        default:
          "bg-primary text-primary-foreground font-semibold hover:bg-accent-hover",
        // Destructive — solid red, slight opacity drop on hover.
        destructive:
          "bg-destructive text-destructive-foreground hover:opacity-90",
        // Outline — transparent body, border-only, fills with secondary on hover.
        outline:
          "border border-input bg-transparent text-foreground hover:bg-secondary hover:border-surface-3",
        // Secondary — filled surface-2, lifts to surface-3 on hover.
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-surface-3",
        // Ghost — no chrome until hover. Used for sidebar nav, account chip.
        ghost:
          "text-foreground-2 hover:bg-secondary hover:text-foreground",
        // Link — text-only with underline-on-hover.
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded px-3 text-[13px]",
        lg: "h-11 rounded px-6 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
