"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

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

type RewardResponse = {
  issues?: RewardRow[];
  error?: string;
};

type Filter = "all" | "issued" | "used" | "expired";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function StatusChip({ status }: { status: RewardRow["status"] }) {
  const colors: Record<RewardRow["status"], string> = {
    issued: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
    used: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200",
    expired: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  };
  const labels: Record<RewardRow["status"], string> = {
    issued: "Active",
    used: "Used",
    expired: "Expired",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function BusinessRewardsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { user } = useAuth();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [marking, setMarking] = useState<string | null>(null);

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
        const query = filter === "all" ? "" : `?status=${filter}`;
        const res = await fetch(`/api/business/${businessId}/rewards/issues${query}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as RewardResponse;
        if (!res.ok || !json.issues) {
          throw new Error(json.error ?? "Failed to load rewards.");
        }
        if (!canceled) setRewards(json.issues);
      } catch (err) {
        if (!canceled) {
          setError(err instanceof Error ? err.message : "Failed to load rewards.");
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [businessId, filter, user]);

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
    const totals = rewards.reduce(
      (acc, r) => {
        acc.total += 1;
        acc[r.status] += 1;
        return acc;
      },
      { total: 0, issued: 0, used: 0, expired: 0 },
    );
    return totals;
  }, [rewards]);

  return (
    <div className="space-y-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Rewards</h1>
          <p className="mt-2 text-sm text-zinc-300">
            View rewards issued to customers and their in-person redemption status.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Total issued" value={summary.total} loading={loading} />
        <Stat label="Active" value={summary.issued} loading={loading} />
        <Stat label="Used" value={summary.used} loading={loading} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "issued", "used", "expired"] as Filter[]).map((option) => (
          <button
            key={option}
            className={[
              "inline-flex h-9 items-center justify-center rounded-full border px-4 text-xs font-semibold uppercase tracking-wide transition",
              option === filter
                ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-100"
                : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
            ].join(" ")}
            type="button"
            onClick={() => setFilter(option)}
          >
            {option === "all"
              ? "All"
              : option === "issued"
                ? "Active"
                : option === "used"
                  ? "Used"
                  : "Expired"}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm font-medium">
          <div>Recent rewards</div>
          <div className="text-xs text-zinc-400">
            {loading ? "Loading…" : `${rewards.length} loaded`}
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 border-b border-white/10 bg-black/40 text-left text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-2">Reward</th>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Issued</th>
                <th className="px-4 py-2">Used/Expires</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Marked by</th>
                <th className="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rewards.length === 0 && !loading ? (
                <tr>
                  <td className="px-4 py-3 text-zinc-400" colSpan={8}>
                    No rewards to show.
                  </td>
                </tr>
              ) : null}
              {rewards.map((r) => (
                <tr key={r.id} className="border-b border-white/5 text-sm">
                  <td className="px-4 py-2">
                    <div className="font-semibold text-white">
                      {r.title ?? r.dealId ?? "Reward"}
                    </div>
                    <div className="text-xs text-zinc-400">
                      User: {r.userId ?? "unknown"}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-emerald-200">
                    {r.code ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <StatusChip status={r.status} />
                  </td>
                  <td className="px-4 py-2 text-zinc-300">
                    {formatDate(r.issuedAt)}
                  </td>
                  <td className="px-4 py-2 text-zinc-300">
                    {r.status === "used"
                      ? `Used ${formatDate(r.usedAt)}`
                      : `Expires ${formatDate(r.expiresAt)}`}
                  </td>
                  <td className="px-4 py-2 text-zinc-300">
                    <div>{r.userName ?? "—"}</div>
                    <div className="text-xs text-zinc-400">{r.userEmail ?? "—"}</div>
                  </td>
                  <td className="px-4 py-2 text-zinc-300">
                    {r.usedBy ? (
                      <>
                        <div>{r.usedBy.staffName ?? r.usedBy.staffId ?? "—"}</div>
                        <div className="text-xs text-zinc-400">
                          {r.usedBy.staffEmail ?? "—"}
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      className="inline-flex h-8 items-center justify-center rounded-full border border-white/10 px-3 text-xs font-semibold transition hover:bg-white/10 disabled:opacity-60"
                      onClick={() => markUsed(r)}
                      disabled={r.status !== "issued" || marking === r.id}
                    >
                      {marking === r.id ? "Marking…" : r.status === "issued" ? "Mark used" : "—"}
                    </button>
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

function Stat({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
      <div className="text-xs uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-white">
        {loading ? "…" : value}
      </div>
    </div>
  );
}
