"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

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

export default function BusinessDealsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { user } = useAuth();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

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
        const [dealsRes, locationsRes] = await Promise.all([
          fetch(`/api/business/${businessId}/deals`, {
            headers: { Authorization: `Bearer ${idToken}` },
          }),
          fetch(`/api/business/${businessId}/locations`, {
            headers: { Authorization: `Bearer ${idToken}` },
          }),
        ]);
        const dealsJson = (await dealsRes.json()) as { deals?: Deal[]; error?: string };
        if (!dealsRes.ok || !dealsJson.deals) {
          throw new Error(dealsJson.error ?? "Failed to load deals.");
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
          setLocations(locJson.locations);
        }
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : "Failed to load deals.");
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [businessId, user]);

  async function submit() {
    if (!user || !businessId) return;
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
      if (!res.ok || !json.deal) throw new Error(json.error ?? "Failed to create deal.");
      const createdDeal = json.deal;
      setDeals((prev) => [createdDeal, ...prev]);
      setForm(defaultForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 text-white">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">Deals</h1>
        <p className="mt-2 text-sm text-zinc-300">
          Create rewards for this business. Active deals appear on the public rewards page.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/20">
        <div className="text-sm font-semibold text-white">Create a new deal</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            <div className="mb-1 text-zinc-300">Title</div>
            <input
              className="h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-white outline-none focus:ring-2 focus:ring-emerald-300/40"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. $10 Off Any Bay"
            />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-zinc-300">Point cost</div>
            <input
              className="h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-white outline-none focus:ring-2 focus:ring-emerald-300/40"
              type="number"
              value={form.pointCost}
              onChange={(e) => setForm((f) => ({ ...f, pointCost: e.target.value }))}
              placeholder="400"
              min={1}
            />
          </label>
          <label className="text-sm md:col-span-2">
            <div className="mb-1 text-zinc-300">Description</div>
            <textarea
              className="min-h-[72px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-300/40"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Instant $10 off your next bay booking."
            />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-zinc-300">Type</div>
            <select
              className="h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-white outline-none focus:ring-2 focus:ring-emerald-300/40"
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
            <div className="mb-1 text-zinc-300">Terms</div>
            <input
              className="h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-white outline-none focus:ring-2 focus:ring-emerald-300/40"
              value={form.terms}
              onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))}
              placeholder="One per visit. Not valid with other offers."
            />
          </label>
          <div className="text-sm md:col-span-2">
            <div className="mb-1 text-zinc-300">Locations</div>
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
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-white/30 bg-black/40 text-emerald-300 focus:ring-emerald-300/40"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...form.locations, loc.id]
                            : form.locations.filter((id) => id !== loc.id);
                          setForm((f) => ({ ...f, locations: next }));
                        }}
                      />
                      <span>{loc.name}</span>
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
            className="inline-flex h-10 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-400/20 px-5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/30 disabled:opacity-60"
            type="button"
            onClick={submit}
            disabled={saving}
          >
            {saving ? "Saving…" : "Create deal"}
          </button>
          <div className="text-xs text-zinc-400">
            Deals go live immediately for this business.
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm font-medium">
          <div>Existing deals</div>
          <div className="text-xs text-zinc-400">
            {loading ? "Loading…" : `${deals.length} loaded`}
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 border-b border-white/10 bg-black/40 text-left text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Points</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {deals.length === 0 && !loading ? (
                <tr>
                  <td className="px-4 py-3 text-zinc-400" colSpan={3}>
                    No deals yet.
                  </td>
                </tr>
              ) : null}
              {deals.map((deal) => (
                <tr key={deal.id} className="border-b border-white/5 text-sm">
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
                  <td className="px-4 py-2 text-zinc-300">
                    {deal.active ? "Active" : "Inactive"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
