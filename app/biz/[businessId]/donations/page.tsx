"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

type DonationRow = {
  id: string;
  amountCents: number | null;
  points: number | null;
  causeId: string | null;
  causeTitle: string | null;
  locationId: string | null;
  locationSlug: string | null;
  status: string | null;
  createdAt: string | null;
  userId: string | null;
};

function formatMoney(cents: number | null) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function BusinessDonationsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { user } = useAuth();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [donations, setDonations] = useState<DonationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const res = await fetch(`/api/business/${businessId}/donations`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as { donations?: DonationRow[]; error?: string };
        if (!res.ok || !json.donations) {
          throw new Error(json.error ?? "Failed to load donations.");
        }
        if (!canceled) setDonations(json.donations);
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : "Failed to load donations.");
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [businessId, user]);

  const summary = useMemo(() => {
    const totalVolume = donations.reduce(
      (sum, d) => sum + (typeof d.amountCents === "number" ? d.amountCents : 0),
      0,
    );
    return { total: donations.length, totalVolume };
  }, [donations]);

  return (
    <div className="space-y-6 text-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Business Console</p>
        <h1 className="text-2xl font-bold tracking-tight text-white">Donations</h1>
        <p className="mt-1 text-sm text-zinc-500">Track donations across your locations and charities.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total Donations</div>
          <div className="mt-1 text-2xl font-bold text-white">{summary.total}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Processed Volume</div>
          <div className="mt-1 text-2xl font-bold text-white">{formatMoney(summary.totalVolume)}</div>
        </div>
      </div>

      {loading && donations.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-sm text-zinc-500">Loading…</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.02]">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
            <div className="font-semibold text-white">Recent donations</div>
            <div className="text-xs text-zinc-500">
              {loading ? "Loading…" : `${donations.length} loaded`}
            </div>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 border-b border-white/5 bg-white/[0.02] text-left text-xs uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-4 py-2">Cause</th>
                  <th className="px-4 py-2">Location</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Points</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {donations.length === 0 && !loading ? (
                  <tr>
                    <td className="px-4 py-3 text-zinc-500" colSpan={6}>
                      No donations yet.
                    </td>
                  </tr>
                ) : null}
                {donations.map((d) => (
                  <tr key={d.id} className="border-t border-white/5 text-sm hover:bg-white/[0.02]">
                    <td className="px-4 py-2 text-white">{d.causeTitle ?? d.causeId ?? "—"}</td>
                    <td className="px-4 py-2 text-zinc-300">{d.locationSlug ?? d.locationId ?? "—"}</td>
                    <td className="px-4 py-2 text-zinc-200">{formatMoney(d.amountCents)}</td>
                    <td className="px-4 py-2 text-zinc-200">{d.points ?? "—"}</td>
                    <td className="px-4 py-2 text-zinc-300 capitalize">{d.status ?? "—"}</td>
                    <td className="px-4 py-2 text-zinc-300">{formatDate(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
