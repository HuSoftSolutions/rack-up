"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLocationScope } from "../location-scope";

type Deal = {
  id: string;
  title: string | null;
  description: string | null;
  pointCost: number | null;
  type: string | null;
  terms: string | null;
  locations: string[];
  active: boolean;
  createdAt?: string | null;
};

const defaultForm = {
  title: "",
  description: "",
  pointCost: "",
  type: "amount_off",
  terms: "",
  locations: [] as string[],
};

const typeLabels: Record<string, string> = {
  amount_off: "$ off",
  percent_off: "% off",
  bogo: "BOGO",
  free_item: "Free item",
};

export default function BusinessOffersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { user } = useAuth();
  const { locationId, role } = useLocationScope();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

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
        const [dealsRes, locationsRes] = await Promise.all([
          fetch(
            `/api/business/${businessId}/deals${
              locationId ? `?locationId=${encodeURIComponent(locationId)}` : ""
            }`,
            {
            headers: { Authorization: `Bearer ${idToken}` },
          }),
          fetch(`/api/business/${businessId}/locations`, {
            headers: { Authorization: `Bearer ${idToken}` },
          }),
        ]);
        const dealsJson = (await dealsRes.json()) as { deals?: Deal[]; error?: string };
        if (!dealsRes.ok || !dealsJson.deals) {
          throw new Error(dealsJson.error ?? "Failed to load offers.");
        }
        const locJson = (await locationsRes.json()) as {
          locations?: Array<{ id: string; name: string }>;
          error?: string;
        };
        if (!locationsRes.ok || !locJson.locations) {
          throw new Error(locJson.error ?? "Failed to load locations.");
        }
        if (!canceled) {
          setDeals(dealsJson.deals);
          const nextLocations = locJson.locations ?? [];
          setLocations(
            locationId ? nextLocations.filter((loc) => loc.id === locationId) : nextLocations,
          );
        }
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : "Failed to load offers.");
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [businessId, locationId, role, user]);

  useEffect(() => {
    if (role !== "staff") return;
    if (!locationId) return;
    if (form.locations.length > 0) return;
    setForm((prev) => ({ ...prev, locations: [locationId] }));
  }, [form.locations.length, locationId, role]);

  async function submit() {
    if (!user || !businessId) return;
    if (role === "staff" && !locationId) return;
    setSaving(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const payload = {
        title: form.title,
        description: form.description,
        pointCost: Number(form.pointCost),
        type: form.type,
        terms: form.terms,
        locations: form.locations,
      };
      const res = await fetch(`/api/business/${businessId}/deals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { deal?: Deal; error?: string };
      if (!res.ok || !json.deal) throw new Error(json.error ?? "Failed to create offer.");
      const createdDeal = json.deal;
      setDeals((prev) => [createdDeal, ...prev]);
      setForm(defaultForm);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create offer.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && deals.length === 0) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-zinc-400">
        Loading offers…
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Business Console</p>
        <h1 className="text-2xl font-bold tracking-tight text-white">Offers</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Create rewards customers can redeem with their points.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total Offers</div>
          <div className="mt-1 text-2xl font-bold text-white">{deals.length}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Active</div>
          <div className="mt-1 text-2xl font-bold text-white">{deals.filter((d) => d.active).length}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Locations</div>
          <div className="mt-1 text-2xl font-bold text-white">{locations.length}</div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {/* Existing offers table - ABOVE the create form */}
      <div className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.02]">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
          <div className="font-semibold text-white">Existing offers</div>
          <div className="text-xs text-zinc-500">
            {loading ? "Loading…" : `${deals.length} loaded`}
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 border-b border-white/5 bg-white/[0.02] text-left text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Points</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {deals.length === 0 && !loading ? (
                <tr>
                  <td className="px-4 py-3 text-zinc-400" colSpan={4}>
                    No offers yet.
                  </td>
                </tr>
              ) : null}
              {deals.map((deal) => (
                <tr key={deal.id} className="border-t border-white/5 text-sm hover:bg-white/[0.02]">
                  <td className="px-4 py-2">
                    <div className="font-semibold text-white">
                      {deal.title ?? "Untitled"}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {deal.description ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-zinc-300">
                    {typeof deal.pointCost === "number" ? `${deal.pointCost} pts` : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-medium text-zinc-300">
                      {typeLabels[deal.type ?? ""] ?? deal.type ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {deal.active ? (
                      <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-xs font-medium text-emerald-300">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-400/20 px-2 py-0.5 text-xs font-medium text-zinc-400">
                        Inactive
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create offer - collapsible */}
      {!showForm ? (
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white hover:bg-emerald-400"
          onClick={() => setShowForm(true)}
        >
          + Create Offer
        </button>
      ) : (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Create a new offer</h3>
            <button
              type="button"
              className="text-xs text-zinc-400 hover:text-white"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <div className="mb-1 text-xs font-medium text-zinc-500">Title</div>
              <input
                className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. $10 Off Any Bay"
              />
            </label>
            <label className="text-sm">
              <div className="mb-1 text-xs font-medium text-zinc-500">Point cost</div>
              <input
                className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
                type="number"
                value={form.pointCost}
                onChange={(e) => setForm((f) => ({ ...f, pointCost: e.target.value }))}
                placeholder="400"
                min={1}
              />
            </label>
            <label className="text-sm md:col-span-2">
              <div className="mb-1 text-xs font-medium text-zinc-500">Description</div>
              <textarea
                className="min-h-[72px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Instant $10 off your next bay booking."
              />
            </label>
            <label className="text-sm">
              <div className="mb-1 text-xs font-medium text-zinc-500">Type</div>
              <select
                className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="amount_off">$ off</option>
                <option value="percent_off">% off</option>
                <option value="bogo">BOGO</option>
                <option value="free_item">Free item</option>
              </select>
            </label>
            <label className="text-sm">
              <div className="mb-1 text-xs font-medium text-zinc-500">Terms</div>
              <input
                className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
                value={form.terms}
                onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))}
                placeholder="One per visit. Not valid with other offers."
              />
            </label>
            <div className="text-sm md:col-span-2">
              <div className="mb-1 text-xs font-medium text-zinc-500">Locations</div>
              {locations.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400">
                  No locations found for this business.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {locations.map((loc) => {
                    const checked = form.locations.includes(loc.id);
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
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...form.locations, loc.id]
                              : form.locations.filter((id) => id !== loc.id);
                            setForm((f) => ({ ...f, locations: next }));
                          }}
                        />
                        {loc.name}
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="mt-2 text-xs text-zinc-400">
                Leave all unchecked to allow redemption at any location.
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60"
              type="button"
              onClick={submit}
              disabled={saving}
            >
              {saving ? "Saving…" : "Create offer"}
            </button>
            <div className="text-xs text-zinc-400">
              Offers go live immediately for this business.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
