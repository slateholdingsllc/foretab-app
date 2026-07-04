"use client";

import { useTransition, useState } from "react";
import { lookupZipCenter } from "@/lib/rpc/feed";
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
  placedCount,
  unplacedCount,
}: {
  territory: "all" | "in" | "out";
  onTerritoryChange: (v: "all" | "in" | "out") => void;
  radiusCenter: { lat: number; lng: number } | null;
  onRadiusCenterChange: (c: { lat: number; lng: number } | null) => void;
  radiusMiles: number | null;
  onRadiusMilesChange: (m: number | null) => void;
  placedCount: number;
  unplacedCount: number;
}) {
  const [zip, setZip] = useState("");
  const [zipError, setZipError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function applyZip() {
    setZipError(null);
    startTransition(async () => {
      const center = await lookupZipCenter(zip.trim());
      if (!center) {
        setZipError("No locations found for this ZIP.");
        return;
      }
      onRadiusCenterChange(center);
      if (radiusMiles === null) onRadiusMilesChange(10);
    });
  }

  function clearRadius() {
    onRadiusCenterChange(null);
    onRadiusMilesChange(null);
    setZip("");
    setZipError(null);
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
          disabled={isPending}
          className="h-7 w-20 rounded border border-input bg-background px-2 text-[13px] text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        {RADIUS_OPTIONS.map((o) => (
          <button
            key={o.miles}
            type="button"
            onClick={() => {
              onRadiusMilesChange(radiusMiles === o.miles ? null : o.miles);
              if (radiusMiles !== o.miles && !radiusCenter && zip.length === 5) applyZip();
            }}
            className={cn(
              CHIP_BASE,
              radiusCenter && radiusMiles === o.miles ? CHIP_ON : CHIP_OFF,
            )}
          >
            {o.label}
          </button>
        ))}
        {radiusCenter ? (
          <button
            type="button"
            onClick={clearRadius}
            className="text-[12px] text-foreground-muted hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
        {zipError ? (
          <span className="text-[12px] text-destructive">{zipError}</span>
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
          {placedCount.toLocaleString()} placed
          {unplacedCount > 0 ? ` · ${unplacedCount.toLocaleString()} unplaced` : ""}
        </span>
      </div>
    </div>
  );
}
