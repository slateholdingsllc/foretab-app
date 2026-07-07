"use client";

import * as LabelPrimitive from "@radix-ui/react-label";
import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Label primitive. Wraps Radix Label for accessibility.
 *
 * Two visual styles:
 *   - default: Geist Sans 14px, tight tracking, paired with inputs.
 *   - eyebrow: Geist Mono 10px uppercase, paired with section headers
 *              (e.g. "FILTER", "COVERAGE" in the sidebar). Use this
 *              when you want the mono-eyebrow pattern from the brand
 *              sheet — not when you want a form-field label.
 */
const labelVariants = cva(
  "peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
  {
    variants: {
      variant: {
        default:
          "text-sm font-medium leading-none tracking-[-0.005em] text-foreground",
        eyebrow:
          "font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-foreground-muted",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, variant, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants({ variant }), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label, labelVariants };
