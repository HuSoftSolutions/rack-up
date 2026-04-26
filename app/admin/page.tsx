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
  warnings?: string[];
};

type AdminBusiness = {
  id: string;
  name: string;
  locations: { id: string; name: string }[];
};

type ReferralConfig = {
  enabled: boolean;
  inviterPoints: number;
  invitedPoints: number;
};

type SameDayBonusConfig = {
  enabled: boolean;
  bonusPoints: number;
  timezone: string;
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
  const [warnings, setWarnings] = useState<string[]>([]);
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [entitiesError, setEntitiesError] = useState<string | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [referralsLoading, setReferralsLoading] = useState(true);
  const [referralsSaving, setReferralsSaving] = useState(false);
  const [referralsError, setReferralsError] = useState<string | null>(null);
  const [referralsMessage, setReferralsMessage] = useState<string | null>(null);
  const [referralsConfig, setReferralsConfig] = useState<ReferralConfig>({
    enabled: false,
    inviterPoints: 0,
    invitedPoints: 0,
  });
  const [bonusLoading, setBonusLoading] = useState(true);
  const [bonusSaving, setBonusSaving] = useState(false);
  const [bonusError, setBonusError] = useState<string | null>(null);
  const [bonusMessage, setBonusMessage] = useState<string | null>(null);
  const [bonusConfig, setBonusConfig] = useState<SameDayBonusConfig>({
    enabled: false,
    bonusPoints: 20,
    timezone: "America/New_York",
  });

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

        const next = json as AdminOverviewStats;
        setStats(next);
        setWarnings(Array.isArray(next.warnings) ? next.warnings : []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load metrics.");
        setWarnings([]);
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

  useEffect(() => {
    if (authLoading || !user) return;
    const currentUser = user;
    let canceled = false;
    async function loadReferralConfig() {
      setReferralsLoading(true);
      setReferralsError(null);
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch("/api/admin/referrals/config", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as { config?: ReferralConfig; error?: string };
        if (!res.ok || !json.config) {
          throw new Error(json.error ?? "Failed to load referral invite config.");
        }
        if (!canceled) setReferralsConfig(json.config);
      } catch (err) {
        if (!canceled) {
          setReferralsError(err instanceof Error ? err.message : "Failed to load referral invite config.");
        }
      } finally {
        if (!canceled) setReferralsLoading(false);
      }
    }
    void loadReferralConfig();
    return () => {
      canceled = true;
    };
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    const currentUser = user;
    let canceled = false;
    async function loadBonusConfig() {
      setBonusLoading(true);
      setBonusError(null);
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch("/api/admin/same-day-bonus/config", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as { config?: SameDayBonusConfig; error?: string };
        if (!res.ok || !json.config) {
          throw new Error(json.error ?? "Failed to load same-day bonus config.");
        }
        if (!canceled) setBonusConfig(json.config);
      } catch (err) {
        if (!canceled) {
          setBonusError(err instanceof Error ? err.message : "Failed to load same-day bonus config.");
        }
      } finally {
        if (!canceled) setBonusLoading(false);
      }
    }
    void loadBonusConfig();
    return () => {
      canceled = true;
    };
  }, [authLoading, user]);

  async function saveBonusConfig() {
    if (!user || bonusSaving) return;
    setBonusSaving(true);
    setBonusError(null);
    setBonusMessage(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/same-day-bonus/config", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bonusConfig),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save same-day bonus config.");
      setBonusMessage("Same-day bonus settings saved.");
    } catch (err) {
      setBonusError(err instanceof Error ? err.message : "Failed to save same-day bonus config.");
    } finally {
      setBonusSaving(false);
    }
  }

  async function saveReferralConfig() {
    if (!user || referralsSaving) return;
    setReferralsSaving(true);
    setReferralsError(null);
    setReferralsMessage(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/referrals/config", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enabled: referralsConfig.enabled,
          inviterPoints: referralsConfig.inviterPoints,
          invitedPoints: referralsConfig.invitedPoints,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save referral invite config.");
      setReferralsMessage("Referral invite settings saved.");
    } catch (err) {
      setReferralsError(err instanceof Error ? err.message : "Failed to save referral invite config.");
    } finally {
      setReferralsSaving(false);
    }
  }

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
        hint: "Awarded from completed support",
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
        label: "Support",
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
      {warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          {warnings.join(" ")}
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
            Filter to a business or specific location to see support volume and points scoped to that entity.
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
          <li>Support: completed checkouts + recorded entries</li>
          <li>Scope filters: narrow by business and location for targeted views</li>
        </ul>
      </div>

      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <div className="text-sm font-semibold text-white">Referral Invites</div>
        <p className="mt-1 text-xs text-zinc-400">
          Configure public invite-friend rewards for inviter and invited users.
        </p>
        {referralsError ? (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
            {referralsError}
          </div>
        ) : null}
        {referralsMessage ? (
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-200">
            {referralsMessage}
          </div>
        ) : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-zinc-400">
            <div className="mb-1 font-medium text-white">Feature status</div>
            <select
              className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
              value={referralsConfig.enabled ? "enabled" : "disabled"}
              onChange={(event) =>
                setReferralsConfig((prev) => ({ ...prev, enabled: event.target.value === "enabled" }))
              }
              disabled={referralsLoading || referralsSaving}
            >
              <option value="disabled">Disabled</option>
              <option value="enabled">Enabled</option>
            </select>
          </label>
          <label className="text-sm text-zinc-400">
            <div className="mb-1 font-medium text-white">Points to inviter</div>
            <input
              type="number"
              min={0}
              className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
              value={referralsConfig.inviterPoints}
              onChange={(event) =>
                setReferralsConfig((prev) => ({ ...prev, inviterPoints: Math.max(0, Number(event.target.value) || 0) }))
              }
              disabled={referralsLoading || referralsSaving}
            />
          </label>
          <label className="text-sm text-zinc-400">
            <div className="mb-1 font-medium text-white">Points to invited user</div>
            <input
              type="number"
              min={0}
              className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
              value={referralsConfig.invitedPoints}
              onChange={(event) =>
                setReferralsConfig((prev) => ({ ...prev, invitedPoints: Math.max(0, Number(event.target.value) || 0) }))
              }
              disabled={referralsLoading || referralsSaving}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void saveReferralConfig()}
          disabled={referralsLoading || referralsSaving}
          className="mt-3 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
        >
          {referralsSaving ? "Saving..." : "Save Referral Settings"}
        </button>
      </div>

      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <div className="text-sm font-semibold text-white">Same-Day Bonus</div>
        <p className="mt-1 text-xs text-zinc-400">
          Award bonus points when a user scans at both a gym and a partner location on the same day.
          Only one bonus per user per day.
        </p>
        {bonusError ? (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
            {bonusError}
          </div>
        ) : null}
        {bonusMessage ? (
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-200">
            {bonusMessage}
          </div>
        ) : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-zinc-400">
            <div className="mb-1 font-medium text-white">Feature status</div>
            <select
              className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
              value={bonusConfig.enabled ? "enabled" : "disabled"}
              onChange={(event) =>
                setBonusConfig((prev) => ({ ...prev, enabled: event.target.value === "enabled" }))
              }
              disabled={bonusLoading || bonusSaving}
            >
              <option value="disabled">Disabled</option>
              <option value="enabled">Enabled</option>
            </select>
          </label>
          <label className="text-sm text-zinc-400">
            <div className="mb-1 font-medium text-white">Bonus points</div>
            <input
              type="number"
              min={0}
              className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
              value={bonusConfig.bonusPoints}
              onChange={(event) =>
                setBonusConfig((prev) => ({
                  ...prev,
                  bonusPoints: Math.max(0, Number(event.target.value) || 0),
                }))
              }
              disabled={bonusLoading || bonusSaving}
            />
          </label>
          <label className="text-sm text-zinc-400">
            <div className="mb-1 font-medium text-white">Day boundary timezone</div>
            <input
              type="text"
              placeholder="America/New_York"
              className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
              value={bonusConfig.timezone}
              onChange={(event) =>
                setBonusConfig((prev) => ({ ...prev, timezone: event.target.value }))
              }
              disabled={bonusLoading || bonusSaving}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void saveBonusConfig()}
          disabled={bonusLoading || bonusSaving}
          className="mt-3 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
        >
          {bonusSaving ? "Saving..." : "Save Bonus Settings"}
        </button>
      </div>
    </div>
  );
}
