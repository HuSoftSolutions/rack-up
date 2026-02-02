"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

type AdminOverviewStats = {
  userCount: number;
  donationCount: number;
  donationVolumeCents: number;
  pointsIssued: number;
  pointsRedeemed: number;
  netPoints: number;
};

type AdminBusiness = {
  id: string;
  name: string;
  locations: { id: string; name: string }[];
};

function formatNumber(value?: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US")
    : "—";
}

function formatMoney(cents?: number) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
  return cents === 0
    ? "$0.00"
    : (cents / 100).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

export default function AdminOverviewPage() {
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<AdminOverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [entitiesError, setEntitiesError] = useState<string | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");

  const loadStats = useCallback(
    async (scope: { businessId?: string; locationId?: string }) => {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        const idToken = await user.getIdToken();
        const params = new URLSearchParams();
        if (scope.businessId) params.set("businessId", scope.businessId);
        if (scope.locationId) params.set("locationId", scope.locationId);
        const res = await fetch(`/api/admin/overview${params.size ? `?${params.toString()}` : ""}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as
          | (AdminOverviewStats & { error?: string })
          | { error: string };

        const message =
          json && typeof json === "object" && "error" in json && typeof json.error === "string"
            ? json.error
            : "Failed to load metrics.";
        if (!res.ok) {
          throw new Error(message);
        }

        setStats(json as AdminOverviewStats);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load metrics.");
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setStats(null);
      setLoading(false);
      return;
    }
    void loadStats({
      businessId: selectedBusinessId || undefined,
      locationId: selectedLocationId || undefined,
    });
  }, [authLoading, loadStats, selectedBusinessId, selectedLocationId, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    const currentUser = user;
    let canceled = false;
    async function loadEntities() {
      setEntitiesError(null);
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch("/api/admin/entities", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as { businesses?: AdminBusiness[]; error?: string };
        if (!res.ok || !json.businesses) {
          throw new Error(json.error ?? "Failed to load businesses.");
        }
        if (!canceled) {
          setBusinesses(json.businesses);
        }
      } catch (err) {
        if (!canceled) setEntitiesError(err instanceof Error ? err.message : "Failed to load businesses.");
      }
    }
    void loadEntities();
    return () => {
      canceled = true;
    };
  }, [authLoading, user]);

  const statCards = useMemo(
    () => [
      {
        label: "Users",
        value: formatNumber(stats?.userCount),
        hint: "Total registered users",
      },
      {
        label: "Points Issued",
        value: formatNumber(stats?.pointsIssued),
        hint: "Awarded from completed donations",
      },
      {
        label: "Points Redeemed",
        value: formatNumber(stats?.pointsRedeemed),
        hint: "Spent on rewards",
      },
      {
        label: "Net Points",
        value: formatNumber(stats?.netPoints),
        hint: "Outstanding balance across users",
      },
      {
        label: "Donations",
        value: formatNumber(stats?.donationCount),
        hint: `${formatMoney(stats?.donationVolumeCents)} processed volume`,
      },
    ],
    [stats],
  );

  const locationOptions = useMemo(() => {
    const business = businesses.find((b) => b.id === selectedBusinessId);
    return business?.locations ?? [];
  }, [businesses, selectedBusinessId]);

  const scopeLabel = useMemo(() => {
    if (selectedLocationId) {
      const business = businesses.find((b) => b.id === selectedBusinessId);
      const location = locationOptions.find((loc) => loc.id === selectedLocationId);
      return `Location: ${location?.name ?? selectedLocationId} (${business?.name ?? selectedBusinessId})`;
    }
    if (selectedBusinessId) {
      const business = businesses.find((b) => b.id === selectedBusinessId);
      return `Business: ${business?.name ?? selectedBusinessId}`;
    }
    return "All businesses";
  }, [businesses, locationOptions, selectedBusinessId, selectedLocationId]);

  return (
    <div className="space-y-6 text-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Admin</p>
        <h1 className="text-2xl font-bold tracking-tight text-white">Overview</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Scope: {scopeLabel}
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {entitiesError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {entitiesError}
        </div>
      ) : null}

      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm text-zinc-400">
            <div className="mb-1 font-medium text-white">Business scope</div>
            <select
              className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
              value={selectedBusinessId}
              onChange={(e) => {
                setSelectedBusinessId(e.target.value);
                setSelectedLocationId("");
              }}
            >
              <option value="">All businesses</option>
              {businesses.map((biz) => (
                <option key={biz.id} value={biz.id}>
                  {biz.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-zinc-400">
            <div className="mb-1 font-medium text-white">Location scope</div>
            <select
              className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none disabled:opacity-50 placeholder:text-zinc-500 focus:border-emerald-400"
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              disabled={!selectedBusinessId || locationOptions.length === 0}
            >
              <option value="">All locations</option>
              {locationOptions.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center text-xs text-zinc-500 sm:col-span-2 lg:col-span-2">
            Filter to a business or specific location to see donation volume and points scoped to that entity.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{card.label}</div>
            <div className="mt-1 text-2xl font-bold text-white">
              {loading ? (
                <span className="inline-flex h-7 w-16 animate-pulse rounded-lg bg-white/10" />
              ) : (
                card.value
              )}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">{card.hint}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <div className="text-sm font-semibold text-white">What&apos;s included</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-400">
          <li>Users: total registered accounts</li>
          <li>Points issued/redeemed: completed balance transactions</li>
          <li>Donations: completed checkouts + recorded entries</li>
          <li>Scope filters: narrow by business and location for targeted views</li>
        </ul>
      </div>
    </div>
  );
}
