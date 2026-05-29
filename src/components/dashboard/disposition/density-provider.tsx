"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * DensityProvider — compact / comfortable worklist density.
 *
 * Comfortable shows address + facets and roomy padding; compact collapses
 * them for reps grinding a long list. The choice is purely visual (which
 * meta lines show + spacing); same components, same tokens. Persisted to
 * localStorage so it survives reloads, hydration-safe via an effect.
 */
export type Density = "comfortable" | "compact";

const STORAGE_KEY = "foretab.disposition.density";
const DensityContext = React.createContext<{
  density: Density;
  setDensity: (d: Density) => void;
}>({ density: "comfortable", setDensity: () => {} });

export function DensityProvider({
  children,
  defaultDensity = "comfortable",
}: {
  children: React.ReactNode;
  defaultDensity?: Density;
}) {
  const [density, setDensityState] = React.useState<Density>(defaultDensity);

  // Read persisted choice after mount (avoids hydration mismatch).
  React.useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "compact" || saved === "comfortable") setDensityState(saved);
  }, []);

  const setDensity = React.useCallback((d: Density) => {
    setDensityState(d);
    try {
      window.localStorage.setItem(STORAGE_KEY, d);
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, []);

  const value = React.useMemo(() => ({ density, setDensity }), [density, setDensity]);
  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>;
}

export function useDensity() {
  return React.useContext(DensityContext);
}

/** Segmented compact/comfortable control. */
export function DensityToggle({ className }: { className?: string }) {
  const { density, setDensity } = useDensity();
  return (
    <div
      className={cn(
        "inline-flex items-center gap-[3px] rounded-md border border-border bg-surface-2 p-[3px]",
        className,
      )}
      role="radiogroup"
      aria-label="List density"
    >
      <Option active={density === "compact"} onClick={() => setDensity("compact")} label="Compact">
        <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </Option>
      <Option active={density === "comfortable"} onClick={() => setDensity("comfortable")} label="Comfortable">
        <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="5" rx="1" />
          <rect x="3" y="15" width="18" height="5" rx="1" />
        </svg>
      </Option>
    </div>
  );
}

function Option({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-card text-foreground shadow-sm" : "text-foreground-muted hover:text-foreground",
      )}
    >
      {children}
      {label}
    </button>
  );
}
