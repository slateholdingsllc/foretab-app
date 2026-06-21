"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Worklist", href: "/", tourId: undefined },
  { label: "Pipeline", href: "/pipeline", tourId: "nav-pipeline" },
] as const;

/**
 * Primary in-app nav tabs — Worklist and Pipeline.
 * Client component so usePathname() drives the active highlight without
 * a full-page rerender. Sits between the logo and the right-side controls
 * in TopBar.
 */
export function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-0.5 sm:flex" aria-label="Main navigation">
      {TABS.map((t) => {
        const active =
          t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            data-tour-id={t.tourId}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-accent-tint text-primary font-semibold"
                : "text-foreground-muted hover:bg-surface-2 hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
