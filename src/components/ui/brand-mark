import type { SVGAttributes } from "react";

/**
 * Foretab brand mark — the bookmark pennant. Top band in accent,
 * body in `currentColor` so it inherits the surrounding text color
 * (works automatically in both themes).
 *
 * Size is controlled by the caller via Tailwind classes on className
 * (e.g. <BrandMark className="size-5" />). The wordmark sits next to
 * it in the standard lockup; both live inside the top-bar.
 *
 * The accent band uses var(--color-accent) directly rather than a
 * Tailwind class so the SVG renders correctly in static contexts
 * (email signatures, OG fallbacks) where Tailwind utilities aren't
 * available.
 */
export function BrandMark({
  className,
  ...rest
}: SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <path
        d="M16 6 L48 6 L48 58 L32 46 L16 58 Z"
        fill="currentColor"
      />
      <path
        d="M16 6 L48 6 L48 16 L16 16 Z"
        fill="var(--color-accent)"
      />
    </svg>
  );
}
