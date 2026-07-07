"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const CHIP_BASE =
  "inline-flex cursor-pointer select-none items-center text-[13px] font-medium px-2.5 py-[5px] rounded border transition-colors leading-none";
const CHIP_OFF =
  "bg-card border-border text-foreground-2 hover:border-foreground-subtle hover:bg-surface-2 hover:text-foreground";
const CHIP_ON = "bg-accent border-accent text-accent-foreground";

const RADIUS_OPTIONS = [
  { label: "1 mi", miles: 1 },
  { label: "5 mi", miles: 5 },
  { label: "10 mi", miles: 10 },
  { label: "25 mi", miles: 25 },
];

export function MapControls({
  territory,
  onTerritoryChange,
  radiusCenter,
  onRadiusCenterChange,
  radiusMiles,
  onRadiusMilesChange,
  onClearRadius,
  onZipRadius,
  hasActiveRadius,
  isZipRadiusPending,
  placedCount,
  unplacedCount,
  atCap,
}: {
  territory: "all" | "in" | "out";
  onTerritoryChange: (v: "all" | "in" | "out") => void;
  radiusCenter: { lat: number; lng: number } | null;
  onRadiusCenterChange: (c: { lat: number; lng: number } | null) => void;
  radiusMiles: number | null;
  onRadiusMilesChange: (m: number | null) => void;
  onClearRadius: () => void;
  onZipRadius: (zip: string, miles: number) => void;
  hasActiveRadius: boolean;
  isZipRadiusPending: boolean;
  placedCount: number;
  unplacedCount: number;
  atCap?: boolean;
}) {
  const [zip, setZip] = useState("");

  function applyZip(miles?: number) {
    const z = zip.trim();
    if (!/^\d{5}$/.test(z)) return;
    const m = miles ?? radiusMiles ?? 10;
    onZipRadius(z, m);
  }

  function clearRadius() {
    onClearRadius();
    setZip("");
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-card px-4 py-2.5">

      {/* Territory */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted mr-1">
          Territory
        </span>
        {(["all", "in", "out"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onTerritoryChange(v)}
            className={cn(
              CHIP_BASE,
              territory === v ? CHIP_ON : CHIP_OFF,
            )}
          >
            {v === "all" ? "All" : v === "in" ? "In-state" : "Out-of-state"}
          </button>
        ))}
      </div>

      {/* Radius search */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
          Radius
        </span>
        <input
          type="text"
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyZip(); } }}
          placeholder="ZIP"
          maxLength={5}
          disabled={isZipRadiusPending}
          className="h-7 w-20 rounded border border-input bg-background px-2 text-[13px] text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        {RADIUS_OPTIONS.map((o) => (
          <button
            key={o.miles}
            type="button"
            onClick={() => {
              onRadiusMilesChange(radiusMiles === o.miles ? null : o.miles);
              if (zip.length === 5) applyZip(o.miles);
            }}
            disabled={isZipRadiusPending}
            className={cn(
              CHIP_BASE,
              radiusMiles === o.miles && hasActiveRadius ? CHIP_ON : CHIP_OFF,
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {isZipRadiusPending && radiusMiles === o.miles ? "…" : o.label}
          </button>
        ))}
        {hasActiveRadius ? (
          <button
            type="button"
            onClick={clearRadius}
            className="text-[12px] text-foreground-muted hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </div>

      {/* Counts + legend */}
      <div className="ml-auto flex items-center gap-4">
        <div className="flex items-center gap-3 text-[12px] text-foreground-muted">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: "#4F7EEB", boxShadow: "0 0 0 2px white, 0 0 0 3px #4F7EEB22" }}
            />
            In-state
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: "#F59E0B", boxShadow: "0 0 0 2px white, 0 0 0 3px #F59E0B22" }}
            />
            Out-of-state
          </span>
        </div>
        <span className="text-[12px] text-foreground-muted">
          {atCap && !hasActiveRadius
            ? "Showing the 500 most recent"
            : `${placedCount.toLocaleString()} placed`}
          {unplacedCount > 0 ? ` · ${unplacedCount.toLocaleString()} unplaced` : ""}
        </span>
      </div>
    </div>
  );
}
