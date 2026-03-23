"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { normalizeClientRequestError } from "@/lib/client/request-error";
import { useLocationScope } from "../location-scope";

type CauseRow = {
  id: string;
  title?: string;
  description?: string;
  mode?: string;
  pointsPerDollar?: number;
  minAmountCents?: number;
  maxAmountCents?: number;
  predefinedOptions?: { amountCents: number; points: number; label?: string }[];
  selectedLocationIds?: string[];
  createdAt?: string | null;
  active?: boolean;
  legacy?: boolean;
};

function formatMoney(cents?: number | null) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function BusinessCharitiesPage() {
  const { user } = useAuth();
  const { locationId, role } = useLocationScope();
  const params = useParams<{ businessId: string }>();
  const businessId = params.businessId ?? null;
  const [causes, setCauses] = useState<CauseRow[]>([]);
  const [locations, setLocations] = useState<{ id: string; name?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
          throw new Error(json.error ?? "Failed to load charities.");
        }
        if (!canceled) {
          setCauses(json.causes);
          const nextLocations = json.locations ?? [];
          setLocations(
            locationId ? nextLocations.filter((loc) => loc.id === locationId) : nextLocations,
          );
        }
      } catch (err) {
        if (!canceled) setError(normalizeClientRequestError(err, "Failed to load charities."));
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [businessId, locationId, role, user]);

  return (
    <div className="space-y-6 text-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Business Console</p>
        <h1 className="text-2xl font-bold tracking-tight text-white">Charities</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Rack Up charities available to your business. Select locations to display them.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Available Charities</div>
          <div className="mt-1 text-2xl font-bold text-white">{loading ? "…" : causes.length}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Locations</div>
          <div className="mt-1 text-2xl font-bold text-white">{loading ? "…" : locations.length}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Active Charities</div>
          <div className="mt-1 text-2xl font-bold text-white">{loading ? "…" : causes.filter((c) => c.active !== false).length}</div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading && causes.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
          Loading charities…
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {causes.length === 0 && !loading ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-500">
            No charities yet. Admins manage Rack Up charities.
          </div>
        ) : null}
        {causes.map((cause) => {
          const selectedLocations = cause.selectedLocationIds ?? [];
          return (
            <div
              key={cause.id}
              className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm text-white"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`text-xs font-medium uppercase tracking-wide ${
                    cause.active === false
                      ? "text-red-300"
                      : cause.legacy
                        ? "text-amber-300"
                        : "text-emerald-300"
                  }`}>
                    {cause.active === false ? "Inactive" : cause.legacy ? "Legacy" : "Available"}
                  </div>
                  <div className="text-lg font-semibold">{cause.title ?? cause.id}</div>
                  {cause.description ? (
                    <div className="text-xs text-zinc-500 line-clamp-3">{cause.description}</div>
                  ) : null}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="font-medium uppercase tracking-wide text-zinc-500">Mode</div>
                  <div className="font-medium capitalize">{cause.mode ?? "custom"}</div>
                </div>
                <div>
                  <div className="font-medium uppercase tracking-wide text-zinc-500">Points/$</div>
                  <div className="font-medium">
                    {cause.mode === "custom" && cause.pointsPerDollar ? `${cause.pointsPerDollar} pts` : "Varies"}
                  </div>
                </div>
                <div>
                  <div className="font-medium uppercase tracking-wide text-zinc-500">Min</div>
                  <div className="font-medium">{formatMoney(cause.minAmountCents ?? null)}</div>
                </div>
                <div>
                  <div className="font-medium uppercase tracking-wide text-zinc-500">Max</div>
                  <div className="font-medium">{formatMoney(cause.maxAmountCents ?? null)}</div>
                </div>
              </div>

              {cause.mode === "predefined" && cause.predefinedOptions?.length ? (
                <div className="mt-2 text-xs">
                  <div className="font-medium uppercase tracking-wide text-zinc-500">Options</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {cause.predefinedOptions.map((opt) => (
                      <span
                        key={`${opt.amountCents}-${opt.points}-${opt.label ?? "opt"}`}
                        className="rounded-full border border-white/15 bg-white/5 px-2 py-1 font-medium"
                      >
                        {opt.label ?? `${formatMoney(opt.amountCents)} → ${opt.points} pts`}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-3 space-y-1 text-xs">
                <div className="font-medium uppercase tracking-wide text-zinc-500">Show at locations</div>
                <div className="flex flex-wrap gap-2">
                  {locations.map((loc) => {
                    const checked = selectedLocations.includes(loc.id);
                    return (
                      <label
                        key={loc.id}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                          checked
                            ? "border-emerald-300 bg-emerald-300 text-emerald-950 shadow-lg shadow-emerald-400/30"
                            : "border-white/15 bg-white/5 text-white hover:border-white/25"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={checked}
                          onChange={async () => {
                            if (!user || !businessId) return;
                            setSavingId(cause.id);
                            setMessage(null);
                            const next = checked
                              ? selectedLocations.filter((id) => id !== loc.id)
                              : [...selectedLocations, loc.id];
                            try {
                              const idToken = await user.getIdToken();
                              const res = await fetch(`/api/business/${businessId}/cause-links`, {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  Authorization: `Bearer ${idToken}`,
                                },
                                body: JSON.stringify({ causeId: cause.id, locationIds: next }),
                              });
                              const json = (await res.json()) as { ok?: boolean; error?: string };
                              if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to save.");
                              setCauses((prev) =>
                                prev.map((c) =>
                                  c.id === cause.id ? { ...c, selectedLocationIds: next } : c,
                                ),
                              );
                              setMessage("Saved location visibility.");
                            } catch (err) {
                              setMessage(normalizeClientRequestError(err, "Failed to save."));
                            } finally {
                              setSavingId(null);
                            }
                          }}
                        />
                        {loc.name ?? loc.id}
                      </label>
                    );
                  })}
                </div>
              </div>

              {savingId === cause.id ? (
                <div className="mt-2 text-xs text-zinc-500">Saving…</div>
              ) : message ? (
                <div className="mt-2 text-xs text-emerald-200">{message}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
