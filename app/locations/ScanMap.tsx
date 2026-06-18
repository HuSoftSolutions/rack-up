"use client";

import { useEffect, useRef, useState } from "react";
import { getGoogleMapsApiKey, importMapsLibrary } from "@/lib/client/google-maps";

export type MapSpot = {
  id: string;
  title: string;
  address: string;
  lat: number;
  lng: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function ScanMap({ spots }: { spots: MapSpot[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const hasKey = Boolean(getGoogleMapsApiKey());

  useEffect(() => {
    if (!hasKey || spots.length === 0) return;
    let canceled = false;

    async function init() {
      try {
        const [mapsLib, markerLib] = await Promise.all([
          importMapsLibrary<google.maps.MapsLibrary>("maps"),
          importMapsLibrary<google.maps.MarkerLibrary>("marker"),
        ]);
        if (canceled || !ref.current) return;

        const map = new mapsLib.Map(ref.current, {
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoom: 11,
        });
        const bounds = new google.maps.LatLngBounds();
        const info = new mapsLib.InfoWindow();

        spots.forEach((spot) => {
          const position = { lat: spot.lat, lng: spot.lng };
          const marker = new markerLib.Marker({ map, position, title: spot.title });
          bounds.extend(position);
          marker.addListener("click", () => {
            const directions = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              spot.address || spot.title,
            )}`;
            info.setContent(
              `<div style="color:#111;font-family:system-ui,sans-serif;max-width:220px">` +
                `<strong>${escapeHtml(spot.title)}</strong>` +
                (spot.address ? `<br/><span>${escapeHtml(spot.address)}</span>` : "") +
                `<br/><a href="${directions}" target="_blank" rel="noopener noreferrer" style="color:#047857;font-weight:600">Get directions →</a>` +
                `</div>`,
            );
            info.open({ map, anchor: marker });
          });
        });

        if (spots.length === 1) {
          map.setCenter({ lat: spots[0].lat, lng: spots[0].lng });
          map.setZoom(14);
        } else {
          map.fitBounds(bounds, 48);
        }
        setStatus("ready");
      } catch (err) {
        console.error("Scan map failed to load:", err);
        if (!canceled) setStatus("error");
      }
    }

    void init();
    return () => {
      canceled = true;
    };
  }, [spots, hasKey]);

  // No key or no mappable spots → render nothing; the list below still shows everything.
  if (!hasKey || spots.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div ref={ref} className="h-[360px] w-full sm:h-[460px]" />
      {status !== "ready" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
          {status === "error" ? "Map unavailable right now." : "Loading map…"}
        </div>
      ) : null}
    </div>
  );
}
