"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import type { FilterState, MapPin } from "@/lib/dashboard/types";
import { fetchMapPins } from "@/lib/rpc/feed";

// MapView uses Leaflet which requires window/document — client-only.
const MapView = dynamic(() => import("./map-view").then((m) => m.MapView), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-foreground-muted">
      Loading map…
    </div>
  ),
});

export function MapPageClient({
  initialPins,
  placedCount: initialPlacedCount,
  unplacedCount: initialUnplacedCount,
  filters,
}: {
  initialPins: MapPin[];
  placedCount: number;
  unplacedCount: number;
  filters: FilterState;
}) {
  const [pins, setPins] = useState(initialPins);
  const [placed, setPlaced] = useState(initialPlacedCount);
  const [unplaced, setUnplaced] = useState(initialUnplacedCount);
  const [isPending, startTransition] = useTransition();

  function handleZipRadius(zip: string, miles: number) {
    startTransition(async () => {
      const result = await fetchMapPins(filters, { centerZip: zip, radiusMiles: miles });
      setPins(result.pins);
      setPlaced(result.placedCount);
      setUnplaced(result.unplacedCount);
    });
  }

  function handleClearZipRadius() {
    setPins(initialPins);
    setPlaced(initialPlacedCount);
    setUnplaced(initialUnplacedCount);
  }

  return (
    <MapView
      initialPins={pins}
      placedCount={placed}
      unplacedCount={unplaced}
      onZipRadius={handleZipRadius}
      onClearZipRadius={handleClearZipRadius}
      isZipRadiusPending={isPending}
    />
  );
}
