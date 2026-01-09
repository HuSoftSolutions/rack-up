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
    let canceled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const idToken = await user.getIdToken();
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
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Donations</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Recent donations for your business locations and causes.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-black/10 bg-white p-4 text-sm dark:border-white/10 dark:bg-black">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Total donations
          </div>
          <div className="mt-1 text-2xl font-semibold">{summary.total}</div>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 text-sm dark:border-white/10 dark:bg-black">
          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Processed volume
          </div>
          <div className="mt-1 text-2xl font-semibold">{formatMoney(summary.totalVolume)}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-black/10 bg-white dark:border-white/10 dark:bg-black">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 text-sm font-medium dark:border-white/10">
          <div>Recent donations</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {loading ? "Loading…" : `${donations.length} loaded`}
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 border-b border-black/10 bg-white text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:bg-black dark:text-zinc-400">
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
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400" colSpan={6}>
                    No donations yet.
                  </td>
                </tr>
              ) : null}
              {donations.map((d) => (
                <tr key={d.id} className="border-b border-black/5 text-sm dark:border-white/5">
                  <td className="px-4 py-2">{d.causeTitle ?? d.causeId ?? "—"}</td>
                  <td className="px-4 py-2">{d.locationSlug ?? d.locationId ?? "—"}</td>
                  <td className="px-4 py-2">{formatMoney(d.amountCents)}</td>
                  <td className="px-4 py-2">{d.points ?? "—"}</td>
                  <td className="px-4 py-2 capitalize">{d.status ?? "—"}</td>
                  <td className="px-4 py-2">{formatDate(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
