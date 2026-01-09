"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

type DonationRow = {
  id: string;
  userId: string | null;
  businessId: string | null;
  businessName: string | null;
  causeId: string | null;
  causeTitle: string | null;
  amountCents: number | null;
  points: number | null;
  status: string | null;
  stripe: { paymentIntentId?: string; checkoutSessionId?: string } | null;
  createdAt: string | null;
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

export default function AdminDonationsPage() {
  const { user } = useAuth();
  const [donations, setDonations] = useState<DonationRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const currentUser = user;
    let canceled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch("/api/admin/donations", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as { donations?: DonationRow[]; error?: string };
        if (!res.ok || !json.donations) {
          throw new Error(json.error ?? "Failed to load donations.");
        }
        if (!canceled) {
          setDonations(json.donations);
          setSelectedId(json.donations[0]?.id ?? null);
        }
      } catch (err) {
        if (!canceled) {
          setError(err instanceof Error ? err.message : "Failed to load donations.");
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    void load();
    return () => {
      canceled = true;
    };
  }, [user]);

  const selected = useMemo(
    () => donations.find((d) => d.id === selectedId) ?? null,
    [donations, selectedId],
  );

  return (
    <div className="text-white">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Donations</h1>
          <p className="mt-2 text-sm text-zinc-300">
            Review donation activity across all charities/causes.
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-xl shadow-black/20 backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">
            <div>Recent donations</div>
            <div className="text-xs text-zinc-300">
              {loading ? "Loading…" : `${donations.length} loaded`}
            </div>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 border-b border-white/10 bg-black/30 text-left text-xs uppercase tracking-wide text-zinc-300 backdrop-blur">
                <tr>
                  <th className="px-4 py-2">Charity</th>
                  <th className="px-4 py-2">Business</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Points</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {donations.length === 0 && !loading ? (
                  <tr>
                    <td className="px-4 py-3 text-zinc-300" colSpan={6}>
                      No donations yet.
                    </td>
                  </tr>
                ) : null}
                {donations.map((d) => {
                  const isSelected = selectedId === d.id;
                  return (
                    <tr
                      key={d.id}
                      className={[
                        "cursor-pointer border-b border-white/5 transition hover:bg-white/5",
                        isSelected ? "bg-white/10" : "",
                      ].join(" ")}
                      onClick={() => setSelectedId(d.id)}
                    >
                      <td className="px-4 py-2 font-medium text-white">{d.causeTitle ?? d.causeId ?? "—"}</td>
                      <td className="px-4 py-2 text-zinc-200">{d.businessName ?? d.businessId ?? "—"}</td>
                      <td className="px-4 py-2 text-zinc-100">{formatMoney(d.amountCents)}</td>
                      <td className="px-4 py-2 text-zinc-100">{d.points ?? "—"}</td>
                      <td className="px-4 py-2 capitalize text-zinc-200">{d.status ?? "—"}</td>
                      <td className="px-4 py-2 text-zinc-200">{formatDate(d.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur">
          <div className="text-sm font-semibold text-white">Details</div>
          {!selected ? (
            <div className="mt-3 text-sm text-zinc-300">
              Select a donation to inspect details.
            </div>
          ) : (
            <div className="mt-3 space-y-3 text-sm text-white">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-400">
                    Charity
                  </div>
                  <div className="mt-1 font-semibold">{selected.causeTitle ?? selected.causeId ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-400">
                    Business
                  </div>
                  <div className="mt-1 font-semibold">
                    {selected.businessName ?? selected.businessId ?? "—"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-400">
                    Amount
                  </div>
                  <div className="mt-1 font-medium">{formatMoney(selected.amountCents)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-400">
                    Points
                  </div>
                  <div className="mt-1 font-medium">{selected.points ?? "—"}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-400">
                    Status
                  </div>
                  <div className="mt-1 font-medium capitalize">{selected.status ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-400">
                    Created
                  </div>
                  <div className="mt-1 font-medium">{formatDate(selected.createdAt)}</div>
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-400">
                  User ID
                </div>
                <div className="mt-1 font-mono text-xs">{selected.userId ?? "—"}</div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-400">
                  Payment
                </div>
                <div className="mt-1 space-y-1 font-mono text-xs">
                  <div>Intent: {selected.stripe?.paymentIntentId ?? "—"}</div>
                  <div>Session: {selected.stripe?.checkoutSessionId ?? "—"}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
