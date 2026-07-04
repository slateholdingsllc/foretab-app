"use client";

import dynamic from "next/dynamic";
import type { MapPin } from "@/lib/dashboard/types";

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
  placedCount,
  unplacedCount,
}: {
  initialPins: MapPin[];
  placedCount: number;
  unplacedCount: number;
}) {
  return (
    <MapView
      initialPins={initialPins}
      placedCount={placedCount}
      unplacedCount={unplacedCount}
    />
  );
}
