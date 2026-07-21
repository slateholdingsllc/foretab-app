"use client";

import "leaflet/dist/leaflet.css";
import { stateCodeToName } from "@/lib/dashboard/state-names";
import type { MapPin } from "@/lib/dashboard/types";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { MapControls } from "./map-controls";

// CartoDB Positron — clean neutral tiles, no API key required
const TILE_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

// Haversine distance in miles between two lat/lng points
function haversineDistance(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin2 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(sin2));
}

function makePinIcon(inState: boolean | null): L.DivIcon {
  const color = inState === false ? "#F59E0B" : "#4F7EEB";
  return L.divIcon({
    className: "",
    html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.25)"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
    popupAnchor: [0, -10],
  });
}

function RadiusCenterSetter({
  onSet,
}: {
  onSet: (c: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    contextmenu(e) {
      onSet({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

// Flies to the bounds of the current pin set whenever it changes after mount.
// Used to auto-zoom after a ZIP radius fetch or clear.
function MapAutoFit({ pins }: { pins: MapPin[] }) {
  const map = useMap();
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    const placed = pins.filter((p) => p.lat !== null && p.lng !== null);
    if (placed.length === 0) return;
    const bounds = L.latLngBounds(placed.map((p) => [p.lat!, p.lng!] as [number, number]));
    map.flyToBounds(bounds, { padding: [40, 40] as [number, number], maxZoom: 14 });
  }, [pins, map]);

  return null;
}

const MAP_PIN_CAP = 500;

export function MapView({
  initialPins,
  placedCount: initialPlaced,
  unplacedCount: initialUnplaced,
  onZipRadius,
  onClearZipRadius,
  isZipRadiusPending,
  contextParams = "",
}: {
  initialPins: MapPin[];
  placedCount: number;
  unplacedCount: number;
  onZipRadius?: (zip: string, miles: number) => void;
  onClearZipRadius?: () => void;
  isZipRadiusPending?: boolean;
  contextParams?: string;
}) {
  const [territory, setTerritory] = useState<"all" | "in" | "out">("all");
  const [radiusCenter, setRadiusCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusMiles, setRadiusMiles] = useState<number | null>(null);
  // ZIP-based radius is handled server-side (get_map_pins p_center_zip/p_radius_miles).
  // Track whether it's active so we can show the correct empty state + clear button.
  const [zipRadiusActive, setZipRadiusActive] = useState(false);
  const [zipRadiusMiles, setZipRadiusMiles] = useState<number | null>(null);

  const placedPins = useMemo(
    () => initialPins.filter((p) => p.lat !== null && p.lng !== null),
    [initialPins],
  );

  function handleZipRadius(zip: string, miles: number) {
    setZipRadiusActive(true);
    setZipRadiusMiles(miles);
    setRadiusCenter(null); // clear any right-click center
    onZipRadius?.(zip, miles);
  }

  function handleClearRadius() {
    setRadiusCenter(null);
    setRadiusMiles(null);
    if (zipRadiusActive) {
      setZipRadiusActive(false);
      setZipRadiusMiles(null);
      onClearZipRadius?.();
    }
  }

  const visiblePins = useMemo(() => {
    let pins = placedPins;
    if (territory === "in") pins = pins.filter((p) => p.inState === true);
    else if (territory === "out") pins = pins.filter((p) => p.inState === false);
    // When ZIP radius is active, pins are already filtered server-side — skip haversine.
    if (!zipRadiusActive && radiusCenter && radiusMiles !== null) {
      pins = pins.filter(
        (p) => haversineDistance(radiusCenter, { lat: p.lat!, lng: p.lng! }) <= radiusMiles,
      );
    }
    return pins;
  }, [placedPins, territory, radiusCenter, radiusMiles, zipRadiusActive]);

  const unplacedFiltered = useMemo(() => {
    let pins = initialPins.filter((p) => p.lat === null || p.lng === null);
    if (territory === "in") pins = pins.filter((p) => p.inState === true);
    else if (territory === "out") pins = pins.filter((p) => p.inState === false);
    return pins;
  }, [initialPins, territory]);

  // Initial map bounds fitted to all placed pins; falls back to US view
  const mapProps = useMemo(() => {
    if (placedPins.length === 0) {
      return { center: [39.5, -98.35] as [number, number], zoom: 4 };
    }
    const bounds = L.latLngBounds(placedPins.map((p) => [p.lat!, p.lng!] as [number, number]));
    return { bounds, boundsOptions: { padding: [40, 40] as [number, number] } };
  }, [placedPins]);

  return (
    <div className="flex h-full flex-col">
      <MapControls
        territory={territory}
        onTerritoryChange={setTerritory}
        radiusCenter={radiusCenter}
        onRadiusCenterChange={setRadiusCenter}
        radiusMiles={zipRadiusActive ? zipRadiusMiles : radiusMiles}
        onRadiusMilesChange={setRadiusMiles}
        onClearRadius={handleClearRadius}
        onZipRadius={handleZipRadius}
        hasActiveRadius={zipRadiusActive || radiusCenter !== null}
        isZipRadiusPending={isZipRadiusPending ?? false}
        placedCount={visiblePins.length}
        unplacedCount={unplacedFiltered.length}
        atCap={initialPins.length >= MAP_PIN_CAP}
      />

      {zipRadiusActive && placedPins.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-foreground-muted">
          No locations found near this ZIP. Try a larger radius or a different ZIP code.
        </div>
      ) : placedPins.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-foreground-muted">
          No geocoded locations found. Coordinates are populated as records are processed — check
          back after the next data refresh.
        </div>
      ) : visiblePins.length === 0 && radiusCenter !== null ? (
        <div className="flex flex-1 items-center justify-center text-sm text-foreground-muted">
          No locations found near this ZIP. Try a larger radius or a different ZIP code.
        </div>
      ) : (
        <div className="relative flex-1">
          <MapContainer
            {...mapProps}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom
            attributionControl={false}
          >
            <TileLayer url={TILE_URL} />
            <RadiusCenterSetter onSet={setRadiusCenter} />
            <MapAutoFit pins={initialPins} />
            {visiblePins.map((pin) => (
              <Marker key={pin.id} position={[pin.lat!, pin.lng!]} icon={makePinIcon(pin.inState)}>
                <Popup minWidth={200}>
                  <div style={{ padding: "2px 0", lineHeight: 1.5 }}>
                    <p style={{ fontWeight: 700, fontSize: "13px", marginBottom: "3px" }}>
                      {pin.businessName ?? "Unknown business"}
                    </p>
                    {pin.city ? (
                      <p style={{ fontSize: "12px", color: "#888", marginBottom: "2px" }}>
                        {[pin.city, pin.premisesStateCode, pin.zip].filter(Boolean).join(", ")}
                      </p>
                    ) : null}
                    {pin.inState === false && pin.premisesStateCode ? (
                      <p style={{ fontSize: "11px", color: "#B45309", marginBottom: "2px" }}>
                        {stateCodeToName(pin.premisesStateCode)} premises
                      </p>
                    ) : null}
                    {pin.signalStrength ? (
                      <p style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>
                        {pin.signalStrength} signal
                        {pin.licenseRecordType
                          ? ` · ${pin.licenseRecordType.replace(/_/g, " ")}`
                          : ""}
                      </p>
                    ) : null}
                    {pin.businessName ? (
                      <a
                        href={(() => {
                          const p = new URLSearchParams(contextParams);
                          p.set("q", pin.businessName);
                          p.delete("cursor");
                          return `/?${p.toString()}`;
                        })()}
                        style={{
                          fontSize: "12px",
                          color: "#4F7EEB",
                          textDecoration: "underline",
                        }}
                      >
                        View on worklist →
                      </a>
                    ) : null}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Map attribution — required by CartoDB/OSM ToS, styled minimal */}
          <div
            style={{
              position: "absolute",
              bottom: 4,
              right: 8,
              zIndex: 1000,
              fontSize: 9,
              color: "#94a3b8",
              lineHeight: 1.2,
            }}
          >
            ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              style={{ color: "inherit" }}
            >
              OpenStreetMap
            </a>{" "}
            contributors ©{" "}
            <a
              href="https://carto.com/attributions"
              target="_blank"
              rel="noreferrer"
              style={{ color: "inherit" }}
            >
              CARTO
            </a>
          </div>

          {zipRadiusActive && zipRadiusMiles ? (
            <div
              style={{
                position: "absolute",
                bottom: 24,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 1000,
                background: "rgba(255,255,255,0.9)",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: "6px 14px",
                fontSize: 12,
                color: "#64748b",
                backdropFilter: "blur(4px)",
                pointerEvents: "none",
              }}
            >
              Within {zipRadiusMiles} mi of ZIP
            </div>
          ) : radiusCenter && radiusMiles ? (
            <div
              style={{
                position: "absolute",
                bottom: 24,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 1000,
                background: "rgba(255,255,255,0.9)",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: "6px 14px",
                fontSize: 12,
                color: "#64748b",
                backdropFilter: "blur(4px)",
                pointerEvents: "none",
              }}
            >
              Within {radiusMiles} mi · right-click to reposition
            </div>
          ) : (
            <div
              style={{
                position: "absolute",
                bottom: 24,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 1000,
                background: "rgba(255,255,255,0.85)",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: "6px 14px",
                fontSize: 12,
                color: "#94a3b8",
                backdropFilter: "blur(4px)",
                pointerEvents: "none",
              }}
            >
              Right-click anywhere to set a radius center
            </div>
          )}
        </div>
      )}
    </div>
  );
}
