"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useBusinessAccess } from "@/lib/auth/business";
import { Timestamp, collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";

type RewardRow = {
  id: string;
  code: string | null;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  dealId: string | null;
  status: "issued" | "used" | "expired";
  issuedAt: string | null;
  usedAt: string | null;
  title: string | null;
};

type DonationRow = {
  id: string;
  amountCents: number | null;
  causeTitle: string | null;
  locationSlug: string | null;
  locationId: string | null;
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
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "object" && value !== null && "_seconds" in value) {
    const ts = value as { _seconds: number; _nanoseconds?: number };
    return new Date(ts._seconds * 1000 + Math.floor((ts._nanoseconds ?? 0) / 1_000_000)).toISOString();
  }
  return null;
}

export default function BusinessDashboardPage() {
  const { user } = useAuth();
  const pathname = usePathname();
  const businessId = pathname.split("/")[2];
  const { membership } = useBusinessAccess(businessId);

  const [donations, setDonations] = useState<DonationRow[]>([]);
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [loadingDonations, setLoadingDonations] = useState(true);
  const [loadingRewards, setLoadingRewards] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [indexWarnings, setIndexWarnings] = useState<string[]>([]);

  // Quick redeem state
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemResult, setRedeemResult] = useState<{ ok: boolean; message: string } | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Mark used
  const [marking, setMarking] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !businessId) return;
    let canceled = false;
    setError(null);
    setLoadingDonations(true);
    const donationsQuery = query(
      collection(firestore, "donations"),
      where("businessId", "==", businessId),
      orderBy("createdAt", "desc"),
      limit(200),
    );
    const unsubscribe = onSnapshot(
      donationsQuery,
      (snap) => {
        if (canceled) return;
        const next = snap.docs
          .map((doc) => {
          const data = doc.data() as Record<string, unknown>;
          return {
            id: doc.id,
            amountCents: (data.amountCents as number | null) ?? null,
            causeTitle: (data.causeTitle as string | null) ?? null,
            locationSlug: (data.locationSlug as string | null) ?? null,
            locationId: (data.locationId as string | null) ?? null,
            createdAt: toIso(data.createdAt),
          } satisfies DonationRow;
        })
          .filter((donation) => {
            if (!membership || membership.role === "owner") return true;
            const allowed = membership.locationIds ?? [];
            return donation.locationId ? allowed.includes(donation.locationId) : false;
          });
        setDonations(next);
        setLoadingDonations(false);
      },
      (err) => {
        if (canceled) return;
        const message = err instanceof Error ? err.message : "Failed to load donations.";
        const missingIndex = message.includes("FAILED_PRECONDITION") || message.includes("requires an index");
        if (missingIndex) {
          setIndexWarnings((prev) =>
            prev.includes("donations")
              ? prev
              : [...prev, "donations"],
          );
        }
        setError(missingIndex ? null : message);
        setLoadingDonations(false);
      },
    );
    return () => {
      canceled = true;
      unsubscribe();
    };
  }, [businessId, user]);

  useEffect(() => {
    if (!user || !businessId) return;
    let canceled = false;
    setError(null);
    setLoadingRewards(true);
    const rewardsQuery = query(
      collection(firestore, "reward_issues"),
      where("businessId", "==", businessId),
      orderBy("issuedAt", "desc"),
      limit(200),
    );
    const unsubscribe = onSnapshot(
      rewardsQuery,
      (snap) => {
        if (canceled) return;
        const next = snap.docs.map((doc) => {
          const data = doc.data() as Record<string, unknown>;
          return {
            id: doc.id,
            code: (data.code as string | null) ?? null,
            userId: (data.userId as string | null) ?? null,
            userEmail: (data.userEmail as string | null) ?? (data.email as string | null) ?? null,
            userName: (data.userName as string | null) ?? null,
            dealId: (data.dealId as string | null) ?? null,
            status: (data.status as RewardRow["status"]) ?? "issued",
            issuedAt: toIso(data.issuedAt),
            usedAt: toIso(data.usedAt),
            title:
              (data.displayPayload as { title?: string } | undefined)?.title ??
              (data.title as string | undefined) ??
              null,
          } satisfies RewardRow;
        });
        setRewards(next);
        setLoadingRewards(false);
      },
      (err) => {
        if (canceled) return;
        const message = err instanceof Error ? err.message : "Failed to load rewards.";
        const missingIndex = message.includes("FAILED_PRECONDITION") || message.includes("requires an index");
        if (missingIndex) {
          setIndexWarnings((prev) =>
            prev.includes("rewards")
              ? prev
              : [...prev, "rewards"],
          );
        }
        setError(missingIndex ? null : message);
        setLoadingRewards(false);
      },
    );
    return () => {
      canceled = true;
      unsubscribe();
    };
  }, [businessId, user]);

  const loading = loadingDonations || loadingRewards;

  async function redeemByCode() {
    if (!user || !businessId || !redeemCode.trim()) return;
    setRedeemLoading(true);
    setRedeemResult(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/business/${businessId}/rewards/use`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ code: redeemCode.trim().toUpperCase() }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setRedeemResult({ ok: false, message: json.error ?? "Failed to redeem code." });
      } else {
        setRedeemResult({ ok: true, message: "Reward redeemed successfully!" });
        setRedeemCode("");
        setRewards((prev) =>
          prev.map((r) =>
            r.code?.toUpperCase() === redeemCode.trim().toUpperCase()
              ? { ...r, status: "used", usedAt: new Date().toISOString() }
              : r,
          ),
        );
      }
    } catch (err) {
      setRedeemResult({ ok: false, message: err instanceof Error ? err.message : "Failed to redeem code." });
    } finally {
      setRedeemLoading(false);
      codeInputRef.current?.focus();
    }
  }

  async function markUsed(issue: RewardRow) {
    if (!user || !businessId || issue.status !== "issued") return;
    setMarking(issue.id);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/business/${businessId}/rewards/mark-used`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ issueId: issue.id }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to mark used.");
      setRewards((prev) =>
        prev.map((r) =>
          r.id === issue.id ? { ...r, status: "used", usedAt: new Date().toISOString() } : r,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark used.");
    } finally {
      setMarking(null);
    }
  }

  const stats = useMemo(() => {
    const totalDonations = donations.length;
    const donationVolume = donations.reduce(
      (sum, d) => sum + (typeof d.amountCents === "number" ? d.amountCents : 0),
      0,
    );
    const activeRewards = rewards.filter((r) => r.status === "issued").length;
    const rewardsRedeemed = rewards.filter((r) => r.status === "used").length;
    return { totalDonations, donationVolume, activeRewards, rewardsRedeemed };
  }, [donations, rewards]);

  const pendingRewards = useMemo(
    () => rewards.filter((r) => r.status === "issued").slice(0, 5),
    [rewards],
  );

  const recentDonations = useMemo(() => donations.slice(0, 5), [donations]);

  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Business Console</p>
        <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Track donations, manage rewards, and redeem codes.
        </p>
      </div>

      {/* Quick Redeem card */}
      <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/[0.05] p-5">
        <div className="text-sm font-semibold text-emerald-300">Quick Redeem</div>
        <p className="mt-1 text-xs text-zinc-400">Enter a customer&apos;s reward code to redeem it.</p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void redeemByCode();
          }}
        >
          <input
            ref={codeInputRef}
            className="h-11 w-full max-w-xs rounded-lg border border-white/10 bg-white/5 px-4 font-mono text-sm uppercase text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
            value={redeemCode}
            onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
            placeholder="ENTER CODE"
            autoFocus
          />
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-emerald-500 px-6 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60"
            disabled={redeemLoading || !redeemCode.trim()}
          >
            {redeemLoading ? "Redeeming…" : "Redeem"}
          </button>
        </form>
        {redeemResult ? (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            redeemResult.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}>
            {redeemResult.message}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {indexWarnings.length > 0 ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Realtime updates are limited because required Firestore indexes are missing. Create composite indexes for{" "}
          {indexWarnings.includes("donations") ? "donations (businessId + createdAt)" : ""}
          {indexWarnings.includes("donations") && indexWarnings.includes("rewards") ? " and " : ""}
          {indexWarnings.includes("rewards") ? "rewards (businessId + issuedAt)" : ""}.
        </div>
      ) : null}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total Donations</div>
          <div className="mt-1 text-2xl font-bold text-white">{loading ? "…" : stats.totalDonations}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Donation Volume</div>
          <div className="mt-1 text-2xl font-bold text-white">{loading ? "…" : formatMoney(stats.donationVolume)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Active Rewards</div>
          <div className="mt-1 text-2xl font-bold text-white">{loading ? "…" : stats.activeRewards}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Rewards Redeemed</div>
          <div className="mt-1 text-2xl font-bold text-white">{loading ? "…" : stats.rewardsRedeemed}</div>
        </div>
      </div>

      {/* Pending Rewards mini-table */}
      <div className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.02]">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
          <div className="font-semibold text-white">Pending Rewards</div>
          <Link
            href={`/biz/${businessId}/redeem`}
            className="text-xs font-semibold text-emerald-300 hover:text-emerald-200"
          >
            View all
          </Link>
        </div>
        {loading ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-500">Loading…</div>
        ) : pendingRewards.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-500">No pending rewards.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-2">Reward</th>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingRewards.map((r) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-2 font-semibold text-white">
                    {r.title ?? "Reward"}
                  </td>
                  <td className="px-4 py-2 font-mono text-emerald-300">
                    {r.code ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-zinc-300">
                    {r.userName ?? r.userEmail ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-zinc-300">
                    {formatDate(r.issuedAt)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/[0.04] disabled:opacity-60"
                      onClick={() => markUsed(r)}
                      disabled={marking === r.id}
                    >
                      {marking === r.id ? "Marking…" : "Mark used"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent Donations mini-table */}
      <div className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.02]">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
          <div className="font-semibold text-white">Recent Donations</div>
          <Link
            href={`/biz/${businessId}/donations`}
            className="text-xs font-semibold text-emerald-300 hover:text-emerald-200"
          >
            View all
          </Link>
        </div>
        {loading ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-500">Loading…</div>
        ) : recentDonations.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-500">No donations yet.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-2">Charity</th>
                <th className="px-4 py-2">Location</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentDonations.map((d) => (
                <tr key={d.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-2 text-white">{d.causeTitle ?? "—"}</td>
                  <td className="px-4 py-2 text-zinc-300">{d.locationSlug ?? d.locationId ?? "—"}</td>
                  <td className="px-4 py-2 text-zinc-200">{formatMoney(d.amountCents)}</td>
                  <td className="px-4 py-2 text-zinc-300">{formatDate(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
