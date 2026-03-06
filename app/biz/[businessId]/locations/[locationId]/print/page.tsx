"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLocationScope } from "../../../location-scope";

type CauseRow = {
  id: string;
  title?: string;
  urls?: { locationId: string; locationName: string; url: string }[];
};

type LocationRow = {
  id: string;
  name?: string;
  slug?: string;
};

type BusinessRow = {
  id: string;
  name: string;
  slug: string;
};

type LocationCause = {
  id: string;
  title: string;
};

export default function LocationPrintChooserPage({
  params,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
}) {
  const { user } = useAuth();
  const { locationId: scopedLocationId, role } = useLocationScope();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [business, setBusiness] = useState<BusinessRow | null>(null);
  const [location, setLocation] = useState<LocationRow | null>(null);
  const [causes, setCauses] = useState<LocationCause[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => {
      setBusinessId(p.businessId);
      setLocationId(p.locationId);
    });
  }, [params]);

  useEffect(() => {
    if (!user || !businessId || !locationId) return;
    if (role === "staff" && scopedLocationId && scopedLocationId !== locationId) {
      setError("Access denied for this location.");
      setLoading(false);
      return;
    }
    const currentUser = user;
    let canceled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch(
          `/api/business/${businessId}/causes${
            locationId ? `?locationId=${encodeURIComponent(locationId)}` : ""
          }`,
          {
            headers: { Authorization: `Bearer ${idToken}` },
          },
        );
        const json = (await res.json()) as {
          business?: BusinessRow;
          locations?: LocationRow[];
          causes?: CauseRow[];
          error?: string;
        };
        if (!res.ok || !json.business || !json.locations || !json.causes) {
          throw new Error(json.error ?? "Failed to load causes.");
        }
        const foundLocation = json.locations.find((loc) => loc.id === locationId);
        if (!foundLocation) {
          throw new Error("Location not found for this business.");
        }
        const locationCauses = json.causes
          .map((cause) => {
            const match = cause.urls?.find((url) => url.locationId === locationId);
            if (!match) return null;
            return {
              id: cause.id,
              title: cause.title ?? cause.id,
            };
          })
          .filter(Boolean) as LocationCause[];

        if (!canceled) {
          setBusiness(json.business);
          setLocation(foundLocation);
          setCauses(locationCauses);
        }
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : "Failed to load location.");
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [businessId, locationId, user]);

  if (loading) {
    return <div className="p-6 text-sm text-zinc-400">Loading print options...</div>;
  }

  if (error || !business || !location) {
    return (
      <div className="p-6 text-sm text-red-200">
        {error ?? "Unable to load location details."}
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">In-person QR</p>
        <h1 className="text-2xl font-bold tracking-tight text-white">Print options</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Choose a printable sheet for {location.name ?? location.id}.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-sm font-semibold text-white">All charities (landing)</div>
          <div className="mt-1 text-xs text-zinc-500">
            One QR that lets guests choose any charity at this location.
          </div>
          <div className="mt-3">
            <Link
              className="inline-flex items-center rounded-md border border-emerald-300/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
              href={`/biz/${business.id}/locations/${location.id}/print/landing`}
            >
              Open printable sheet
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-sm font-semibold text-white">Single charity</div>
          <div className="mt-1 text-xs text-zinc-500">
            Print a dedicated sheet for one charity at this location.
          </div>
          {causes.length === 0 ? (
            <div className="mt-3 text-xs text-zinc-400">No charities linked yet.</div>
          ) : (
            <div className="mt-3 space-y-2">
              {causes.map((cause) => (
                <div key={cause.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <div className="text-xs font-medium text-zinc-200">{cause.title}</div>
                  <Link
                    className="inline-flex items-center rounded-md border border-emerald-300/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                    href={`/biz/${business.id}/locations/${location.id}/print/${cause.id}`}
                  >
                    Open printable sheet
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <Link className="text-sm underline text-zinc-300" href={`/biz/${business.id}/locations`}>
          ← Back to locations
        </Link>
      </div>
    </div>
  );
}
