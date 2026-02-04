"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Timestamp, collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useAuth } from "@/lib/auth/AuthProvider";
import { firestore } from "@/lib/firebase/client";

type RewardRow = {
  id: string;
  code: string | null;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  dealId: string | null;
  businessId: string | null;
  status: "issued" | "used" | "expired";
  issuedAt: string | null;
  expiresAt: string | null;
  usedAt: string | null;
  title: string | null;
  businessName: string | null;
  usedBy: { staffId: string | null; staffEmail: string | null; staffName: string | null } | null;
};

type Filter = "all" | "issued" | "used" | "expired";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function StatusChip({ status }: { status: RewardRow["status"] }) {
  const colors: Record<RewardRow["status"], string> = {
    issued: "bg-emerald-500/15 text-emerald-300",
    used: "bg-blue-500/15 text-blue-300",
    expired: "bg-amber-500/15 text-amber-300",
  };
  const labels: Record<RewardRow["status"], string> = {
    issued: "Pending",
    used: "Used",
    expired: "Expired",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function BusinessRedeemPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { user } = useAuth();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [indexWarning, setIndexWarning] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [marking, setMarking] = useState<string | null>(null);

  // Quick redeem state
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemResult, setRedeemResult] = useState<{ ok: boolean; message: string } | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    params.then((p) => setBusinessId(p.businessId));
  }, [params]);

  useEffect(() => {
    if (!user || !businessId) return;
    let canceled = false;
    setLoading(true);
    setError(null);
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
        const toIso = (val: unknown): string | null => {
          if (!val) return null;
          if (val instanceof Date) return val.toISOString();
          if (val instanceof Timestamp) return val.toDate().toISOString();
          if (typeof val === "object" && val !== null && "_seconds" in val) {
            const ts = val as { _seconds: number; _nanoseconds?: number };
            return new Date(ts._seconds * 1000 + Math.floor((ts._nanoseconds ?? 0) / 1_000_000)).toISOString();
          }
          return null;
        };
        const issues = snap.docs.map((doc) => {
          const data = doc.data() as Record<string, unknown>;
          return {
            id: doc.id,
            code: (data.code as string | null) ?? null,
            userId: (data.userId as string | null) ?? null,
            userEmail: (data.userEmail as string | null) ?? (data.email as string | null) ?? null,
            userName: (data.userName as string | null) ?? null,
            dealId: (data.dealId as string | null) ?? null,
            businessId: (data.businessId as string | null) ?? null,
            status: (data.status as RewardRow["status"]) ?? "issued",
            issuedAt: toIso(data.issuedAt),
            expiresAt: toIso(data.expiresAt),
            usedAt: toIso(data.usedAt),
            title:
              (data.displayPayload as { title?: string } | undefined)?.title ??
              (data.title as string | undefined) ??
              null,
            businessName:
              (data.displayPayload as { businessName?: string } | undefined)?.businessName ??
              (data.businessName as string | undefined) ??
              null,
            usedBy:
              typeof data.usedBy === "object" && data.usedBy
                ? {
                    staffId: (data.usedBy as { staffId?: string | null }).staffId ?? null,
                    staffEmail: (data.usedBy as { staffEmail?: string | null }).staffEmail ?? null,
                    staffName: (data.usedBy as { staffName?: string | null }).staffName ?? null,
                  }
                : null,
          } satisfies RewardRow;
        });
        setRewards(issues);
        setLoading(false);
      },
      (err) => {
        if (canceled) return;
        const message = err instanceof Error ? err.message : "Failed to load rewards.";
        const missingIndex = message.includes("FAILED_PRECONDITION") || message.includes("requires an index");
        if (missingIndex) setIndexWarning(true);
        setError(missingIndex ? null : message);
        setLoading(false);
      },
    );
    return () => {
      canceled = true;
      unsubscribe();
    };
  }, [businessId, user]);

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
      const json = (await res.json()) as { ok?: boolean; error?: string; reward?: RewardRow };
      if (!res.ok || !json.ok) {
        setRedeemResult({ ok: false, message: json.error ?? "Failed to redeem code." });
      } else {
        setRedeemResult({ ok: true, message: "Reward redeemed successfully!" });
        setRedeemCode("");
        // Update the reward in the list if present
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

  const summary = useMemo(() => {
    return rewards.reduce(
      (acc, r) => {
        acc[r.status] += 1;
        return acc;
      },
      { issued: 0, used: 0, expired: 0 },
    );
  }, [rewards]);

  const visibleRewards = useMemo(() => {
    if (filter === "all") return rewards;
    return rewards.filter((r) => r.status === filter);
  }, [filter, rewards]);

  return (
    <div className="space-y-6 text-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Business Console</p>
        <h1 className="text-2xl font-bold tracking-tight text-white">Redeem</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Redeem reward codes and manage issued rewards.
        </p>
      </div>

      {/* Quick Redeem hero card */}
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
      {indexWarning ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Realtime updates are limited because a required Firestore index is missing. Create a composite index for
          rewards (businessId + issuedAt).
        </div>
      ) : null}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Pending</div>
          <div className="mt-1 text-2xl font-bold text-white">{loading ? "…" : summary.issued}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Used</div>
          <div className="mt-1 text-2xl font-bold text-white">{loading ? "…" : summary.used}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Expired</div>
          <div className="mt-1 text-2xl font-bold text-white">{loading ? "…" : summary.expired}</div>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {(["all", "issued", "used", "expired"] as Filter[]).map((option) => (
          <button
            key={option}
            className={`inline-flex h-8 items-center justify-center rounded-full border px-4 text-xs font-semibold transition ${
              option === filter
                ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
                : "border-white/5 bg-white/[0.02] text-zinc-400 hover:border-white/10"
            }`}
            type="button"
            onClick={() => setFilter(option)}
          >
            {option === "all"
              ? "All"
              : option === "issued"
                ? "Pending"
                : option === "used"
                  ? "Used"
                  : "Expired"}
          </button>
        ))}
      </div>

      {/* Rewards table - simplified to 6 columns */}
      {loading && rewards.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-sm text-zinc-500">Loading…</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.02]">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
            <div className="font-semibold text-white">Rewards</div>
            <div className="text-xs text-zinc-500">{loading ? "Loading…" : `${visibleRewards.length} loaded`}</div>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 border-b border-white/5 bg-white/[0.02] text-left text-xs uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-4 py-2">Reward</th>
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRewards.length === 0 && !loading ? (
                  <tr>
                    <td className="px-4 py-3 text-zinc-400" colSpan={6}>
                      No rewards to show.
                    </td>
                  </tr>
                ) : null}
                {visibleRewards.map((r) => (
                  <tr key={r.id} className="border-t border-white/5 text-sm hover:bg-white/[0.02]">
                    <td className="px-4 py-2 font-semibold text-white">
                      {r.title ?? r.dealId ?? "Reward"}
                    </td>
                    <td className="px-4 py-2 font-mono text-emerald-300">
                      {r.code ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <StatusChip status={r.status} />
                    </td>
                    <td className="px-4 py-2 text-zinc-300">
                      {r.userName ?? r.userEmail ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-zinc-300">
                      {r.status === "used" ? formatDate(r.usedAt) : formatDate(r.issuedAt)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.status === "issued" ? (
                        <button
                          type="button"
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/[0.04] disabled:opacity-60"
                          onClick={() => markUsed(r)}
                          disabled={marking === r.id}
                        >
                          {marking === r.id ? "Marking…" : "Mark used"}
                        </button>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
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
