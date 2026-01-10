"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/ui-kit/button";
import { useAuth } from "@/lib/auth/AuthProvider";

type CauseRow = {
  id: string;
  title?: string;
  description?: string;
  mode?: string;
  pointsPerDollar?: number;
  minAmountCents?: number;
  maxAmountCents?: number;
  predefinedOptions?: { amountCents: number; points: number; label?: string }[];
  urls?: { locationId: string; locationName: string; url: string }[];
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

export default function BusinessCausesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { user } = useAuth();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [causes, setCauses] = useState<CauseRow[]>([]);
  const [locations, setLocations] = useState<{ id: string; name?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setBusinessId(p.businessId));
  }, [params]);

  useEffect(() => {
    if (!user || !businessId) return;
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
        const json = (await res.json()) as {
          causes?: CauseRow[];
          locations?: { id: string; name?: string }[];
          error?: string;
        };
        if (!res.ok || !json.causes) {
          throw new Error(json.error ?? "Failed to load causes.");
        }
        if (!canceled) {
          setCauses(json.causes);
          setLocations(json.locations ?? []);
        }
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : "Failed to load causes.");
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [businessId, user]);

  return (
    <div className="space-y-4 text-white">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">Causes</h1>
        <p className="mt-2 text-sm text-zinc-300">
          Rack Up causes available to your business. Select locations to display them.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {businessId && locations.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white shadow-lg shadow-black/30">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Print location QR sheets</div>
              <div className="text-xs text-zinc-300">
                Each sheet includes a QR code that takes donors to this location&apos;s charity options.
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {locations.map((loc) => (
              <div
                key={loc.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
              >
                <div>
                  <div className="text-sm font-semibold text-white">{loc.name ?? loc.id}</div>
                  <div className="text-xs text-zinc-400">{loc.id}</div>
                </div>
                <Button href={`/biz/${businessId}/locations/${loc.id}/print`} outline>
                  Print sheet
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {loading && causes.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
            Loading causes…
          </div>
        ) : null}
        {causes.length === 0 && !loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
            No causes yet. Admins manage Rack Up causes.
          </div>
        ) : null}
        {causes.map((cause) => {
          const selectedLocations = cause.selectedLocationIds ?? [];
          return (
            <div
              key={cause.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white shadow-lg shadow-black/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-400">
                    {cause.active === false ? "Inactive" : cause.legacy ? "Legacy" : "Available"}
                  </div>
                  <div className="text-lg font-semibold">{cause.title ?? cause.id}</div>
                  {cause.description ? (
                    <div className="text-xs text-zinc-300 line-clamp-3">{cause.description}</div>
                  ) : null}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="uppercase tracking-wide text-zinc-400">Mode</div>
                  <div className="font-medium capitalize">{cause.mode ?? "custom"}</div>
                </div>
                <div>
                  <div className="uppercase tracking-wide text-zinc-400">Points/$</div>
                  <div className="font-medium">
                    {cause.mode === "custom" && cause.pointsPerDollar ? `${cause.pointsPerDollar} pts` : "Varies"}
                  </div>
                </div>
                <div>
                  <div className="uppercase tracking-wide text-zinc-400">Min</div>
                  <div className="font-medium">{formatMoney(cause.minAmountCents ?? null)}</div>
                </div>
                <div>
                  <div className="uppercase tracking-wide text-zinc-400">Max</div>
                  <div className="font-medium">{formatMoney(cause.maxAmountCents ?? null)}</div>
                </div>
              </div>

              {cause.mode === "predefined" && cause.predefinedOptions?.length ? (
                <div className="mt-2 text-xs">
                  <div className="uppercase tracking-wide text-zinc-400">Options</div>
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
                <div className="uppercase tracking-wide text-zinc-400">Show at locations</div>
                <div className="flex flex-wrap gap-2">
                  {locations.map((loc) => {
                    const checked = selectedLocations.includes(loc.id);
                    return (
                      <label
                        key={loc.id}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] ${
                          checked
                            ? "border-emerald-300 bg-emerald-300 text-emerald-950"
                            : "border-white/15 bg-white/5 text-white"
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
                              setMessage(err instanceof Error ? err.message : "Failed to save.");
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
                {cause.urls && cause.urls.length > 0 ? (
                  <div className="mt-2 space-y-2 text-xs">
                    <div className="font-semibold text-white">Donation links</div>
                    {cause.urls.map((u) => (
                      <div
                        key={`${u.locationId}-${u.url}`}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                      >
                        <div className="font-medium text-white">{u.locationName}</div>
                        <div className="text-zinc-300">{u.url}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {savingId === cause.id ? (
                <div className="mt-2 text-xs text-zinc-300">Saving…</div>
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
