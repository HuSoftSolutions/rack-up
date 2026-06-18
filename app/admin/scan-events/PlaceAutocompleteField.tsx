"use client";

import { useEffect, useRef, useState } from "react";
import { getGoogleMapsApiKey, importMapsLibrary } from "@/lib/client/google-maps";
import type { ScanEventLocation } from "@/lib/types/scan-event";

type Props = {
  value: ScanEventLocation | null;
  onChange: (place: ScanEventLocation | null) => void;
};

export default function PlaceAutocompleteField({ value, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const hasKey = Boolean(getGoogleMapsApiKey());

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!hasKey) return;
    let canceled = false;
    let el: HTMLElement | null = null;

    async function mount() {
      try {
        const places = await importMapsLibrary<google.maps.PlacesLibrary>("places");
        if (canceled || !hostRef.current) return;

        const autocomplete = new places.PlaceAutocompleteElement({
          includedRegionCodes: ["us"],
        });
        autocomplete.style.width = "100%";
        el = autocomplete as unknown as HTMLElement;

        autocomplete.addEventListener("gmp-select", async (event: Event) => {
          const prediction = (event as unknown as { placePrediction?: google.maps.places.PlacePrediction })
            .placePrediction;
          if (!prediction) return;
          const place = prediction.toPlace();
          await place.fetchFields({ fields: ["formattedAddress", "location"] });
          const loc = place.location;
          if (!loc) return;
          onChangeRef.current({
            address: place.formattedAddress ?? "",
            lat: loc.lat(),
            lng: loc.lng(),
            placeId: place.id ?? null,
          });
        });

        hostRef.current.replaceChildren(autocomplete);
        setStatus("ready");
      } catch (err) {
        console.error("Places autocomplete failed to load:", err);
        if (!canceled) setStatus("error");
      }
    }

    void mount();
    return () => {
      canceled = true;
      el?.remove();
    };
  }, [hasKey]);

  if (!hasKey) {
    return (
      <div className="rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100">
        Address search is unavailable until <code className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> is
        configured. Once set, you can search an address here and its map location is saved automatically.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={hostRef}
        className="scan-place-autocomplete rounded-md border border-white/15 bg-white/[0.04] [&_*]:box-border"
      >
        {status === "loading" ? (
          <div className="px-3 py-2 text-xs text-zinc-500">Loading address search…</div>
        ) : null}
      </div>

      {status === "error" ? (
        <div className="text-xs text-red-300">
          Couldn&apos;t load Google address search. Check the API key and that Places API (New) + Maps JavaScript API
          are enabled.
        </div>
      ) : null}

      {value?.address ? (
        <div className="flex items-start justify-between gap-3 rounded-md border border-emerald-300/20 bg-emerald-500/[0.08] px-3 py-2 text-xs text-emerald-100">
          <span>
            <span className="font-semibold">Selected:</span> {value.address}
            <span className="ml-1 text-emerald-300/70">
              ({value.lat.toFixed(5)}, {value.lng.toFixed(5)})
            </span>
          </span>
          <button
            type="button"
            className="shrink-0 font-semibold text-emerald-300 underline hover:text-emerald-200"
            onClick={() => onChangeRef.current(null)}
          >
            Clear
          </button>
        </div>
      ) : (
        <div className="text-xs text-zinc-500">No location set yet — search an address above.</div>
      )}
    </div>
  );
}
