"use client";

import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLocationScope } from "../location-scope";

type LocationRow = {
  id: string;
  name?: string;
  donationUrl?: string;
};

type CauseRow = {
  id: string;
  title?: string;
  urls?: { locationId: string; url: string }[];
};

type ApiResponse = {
  business?: { id: string; name?: string };
  locations?: LocationRow[];
  causes?: CauseRow[];
  error?: string;
};

export default function BusinessQrBuilderPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { user } = useAuth();
  const { locationId: scopedLocationId, role } = useLocationScope();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [causes, setCauses] = useState<CauseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [target, setTarget] = useState<"landing" | "cause">("landing");
  const [selectedLocationId, setSelectedLocationId] = useState<string | "">("");
  const [selectedCauseId, setSelectedCauseId] = useState<string | "">("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setBusinessId(p.businessId));
  }, [params]);

  useEffect(() => {
    if (!user || !businessId) return;
    if (role === "staff" && !scopedLocationId) return;
    const currentUser = user;
    let canceled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch(`/api/business/${businessId}/causes`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as ApiResponse;
        if (!res.ok || !json.locations || !json.causes) {
          throw new Error(json.error ?? "Failed to load QR data.");
        }
        if (!canceled) {
          const nextLocations =
            role === "staff" && scopedLocationId
              ? json.locations.filter((loc) => loc.id === scopedLocationId)
              : json.locations;
          setLocations(nextLocations);
          setCauses(json.causes);
          if (nextLocations.length > 0 && !selectedLocationId) {
            setSelectedLocationId(nextLocations[0].id);
          }
          if (json.causes.length > 0 && !selectedCauseId) {
            setSelectedCauseId(json.causes[0].id);
          }
        }
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : "Failed to load QR data.");
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [businessId, role, scopedLocationId, user]);

  const selectedLocation = useMemo(
    () => locations.find((loc) => loc.id === selectedLocationId) ?? null,
    [locations, selectedLocationId],
  );
  const selectedCause = useMemo(
    () => causes.find((c) => c.id === selectedCauseId) ?? null,
    [causes, selectedCauseId],
  );

  const resolvedUrl = useMemo(() => {
    if (target === "landing") {
      return selectedLocation?.donationUrl ?? null;
    }
    if (!selectedCause || !selectedLocation) return null;
    return selectedCause.urls?.find((u) => u.locationId === selectedLocation.id)?.url ?? null;
  }, [selectedCause, selectedLocation, target]);

  useEffect(() => {
    if (!resolvedUrl) {
      setQrDataUrl(null);
      return;
    }
    const origin =
      typeof window !== "undefined"
        ? (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin).replace(/\/$/, "")
        : "";
    let canceled = false;
    async function generate() {
      try {
        const data = await QRCode.toDataURL(origin + resolvedUrl, { margin: 1, width: 320 });
        if (!canceled) setQrDataUrl(data);
      } catch {
        if (!canceled) setQrDataUrl(null);
      }
    }
    void generate();
    return () => {
      canceled = true;
    };
  }, [resolvedUrl]);

  return (
    <div className="space-y-6 text-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Business Console</p>
        <h1 className="text-2xl font-bold tracking-tight text-white">QR Builder</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Generate in-person QR codes for charity-specific or landing pages.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-sm font-semibold text-white">In-person QR Settings</div>
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Target</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`rounded-full border px-3 py-1 ${
                    target === "landing" ? "border-emerald-400 bg-emerald-500/20" : "border-white/10"
                  }`}
                  onClick={() => setTarget("landing")}
                >
                  Landing page
                </button>
                <button
                  type="button"
                  className={`rounded-full border px-3 py-1 ${
                    target === "cause" ? "border-emerald-400 bg-emerald-500/20" : "border-white/10"
                  }`}
                  onClick={() => setTarget("cause")}
                >
                  Charity-specific
                </button>
              </div>
            </div>

            {locations.length > 0 ? (
              <label className="block">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Location</div>
                <select
                  className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
                  value={selectedLocationId}
                  onChange={(e) => setSelectedLocationId(e.target.value)}
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name ?? loc.id}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {target === "cause" ? (
              <label className="block">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Charity</div>
                <select
                  className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
                  value={selectedCauseId}
                  onChange={(e) => setSelectedCauseId(e.target.value)}
                >
                  {causes.map((cause) => (
                    <option key={cause.id} value={cause.id}>
                      {cause.title ?? cause.id}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-sm font-semibold text-white">QR Preview</div>
          <div className="mt-4 flex flex-col items-center gap-3">
                {qrDataUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt="QR code" className="h-56 w-56 rounded-2xl border border-white/10 bg-white p-2" />
                    <a
                      href={qrDataUrl}
                      download={`qr-in-person-${target}.png`}
                      className="text-xs font-semibold text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
                    >
                      Download PNG
                </a>
              </>
            ) : (
              <div className="flex h-56 w-56 items-center justify-center rounded-2xl border border-dashed border-white/20 text-xs text-zinc-400">
                {loading ? "Loading…" : "Select options to generate"}
              </div>
            )}
            {resolvedUrl ? (
              <div className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-zinc-300 break-words">
                {resolvedUrl}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
