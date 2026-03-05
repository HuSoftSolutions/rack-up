"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLocationScope } from "../location-scope";

type CauseRow = {
  id: string;
  title?: string;
  selectedLocationIds?: string[];
};

export default function BusinessLocationsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { user } = useAuth();
  const { locationId, role } = useLocationScope();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [locations, setLocations] = useState<{ id: string; name?: string }[]>([]);
  const [causes, setCauses] = useState<CauseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setBusinessId(p.businessId));
  }, [params]);

  useEffect(() => {
    if (!user || !businessId) return;
    if (role === "staff" && !locationId) return;
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
          causes?: CauseRow[];
          locations?: { id: string; name?: string }[];
          error?: string;
        };
        if (!res.ok || !json.causes) {
          throw new Error(json.error ?? "Failed to load locations.");
        }
        if (!canceled) {
          const nextLocations = json.locations ?? [];
          setLocations(
            locationId ? nextLocations.filter((loc) => loc.id === locationId) : nextLocations,
          );
          setCauses(json.causes);
        }
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : "Failed to load locations.");
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [businessId, locationId, role, user]);

  function charitiesLinked(locationId: string) {
    return causes.filter((c) => c.selectedLocationIds?.includes(locationId)).length;
  }

  const totalLinked = new Set(
    causes.flatMap((c) => c.selectedLocationIds ?? []),
  ).size;

  return (
    <div className="space-y-6 text-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Business Console</p>
        <h1 className="text-2xl font-bold tracking-tight text-white">Locations</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Your business locations and QR support sheets.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total Locations</div>
          <div className="mt-1 text-2xl font-bold text-white">{loading ? "…" : locations.length}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Active Charities</div>
          <div className="mt-1 text-2xl font-bold text-white">{loading ? "…" : totalLinked}</div>
        </div>
      </div>

      {loading && locations.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
          Loading locations…
        </div>
      ) : locations.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-500">
          No locations found for this business.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {locations.map((loc) => {
            const linked = charitiesLinked(loc.id);
            return (
              <div
                key={loc.id}
                className="rounded-xl border border-white/5 bg-white/[0.02] p-4"
              >
                <div className="text-sm font-semibold text-white">{loc.name ?? loc.id}</div>
                <div className="text-xs text-zinc-500">{loc.id}</div>
                <div className="mt-2 text-xs text-zinc-400">
                  {linked} {linked === 1 ? "charity" : "charities"} linked
                </div>
                <div className="mt-3">
                  <Link
                    href={`/biz/${businessId}/locations/${loc.id}/print`}
                    className="text-xs font-semibold text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
                  >
                    Print in-person sheet
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
