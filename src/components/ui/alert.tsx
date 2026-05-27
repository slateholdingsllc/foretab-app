import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Alert primitive — for in-page notices. Existing variant API
 * (default | destructive) preserved and extended with three semantic
 * variants from the design direction: info, success, warning.
 *
 * Pattern: tinted background + colored border + icon-tinted-to-variant.
 * The body text stays foreground-default; only the icon and (via
 * AlertTitle below) the title color flip. This matches Vercel/Linear
 * alert patterns — restrained ambient signal, not aggressive coloring.
 *
 * Existing callers using `variant="default"` or `variant="destructive"`
 * keep working unchanged.
 */
const alertVariants = cva(
  "relative w-full rounded-md border p-4 text-sm leading-relaxed [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-secondary border-border text-foreground [&>svg]:text-foreground [&>h5]:text-foreground",
        info:
          "bg-accent-tint border-accent-ring text-foreground [&>svg]:text-primary [&>h5]:text-primary",
        success:
          "bg-success-tint border-success text-foreground [&>svg]:text-success [&>h5]:text-success",
        warning:
          "bg-warning-tint border-warning text-foreground [&>svg]:text-warning [&>h5]:text-warning",
        destructive:
          "bg-destructive-tint border-destructive text-foreground [&>svg]:text-destructive [&>h5]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn(
      "mb-1 font-medium leading-none tracking-[-0.015em]",
      className,
    )}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-foreground-2 [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
