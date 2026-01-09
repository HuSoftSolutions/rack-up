"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/ui-kit/badge";
import { Button } from "@/ui-kit/button";
import { Heading } from "@/ui-kit/heading";
import { Text } from "@/ui-kit/text";
import { useRequireAuth } from "@/lib/auth/routeGuards";

type RewardIssue = {
  id: string;
  dealId: string | null;
  businessId: string | null;
  status: "issued" | "used" | "expired";
  issuedAt: string | null;
  expiresAt: string | null;
  usedAt: string | null;
  title: string | null;
  businessName: string | null;
};

type RewardResponse = {
  issues?: RewardIssue[];
  error?: string;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function StatusBadge({ status }: { status: RewardIssue["status"] }) {
  const colorMap: Record<RewardIssue["status"], "emerald" | "blue" | "orange"> = {
    issued: "emerald",
    used: "blue",
    expired: "orange",
  };
  const label = status === "issued" ? "Active" : status === "used" ? "Used" : "Expired";
  return (
    <Badge color={colorMap[status]} className="px-2.5 py-1">
      {label}
    </Badge>
  );
}

export default function RewardHistoryPage() {
  const { user, loading } = useRequireAuth("/signin?redirect=/rewards/history");
  const [issues, setIssues] = useState<RewardIssue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let canceled = false;
    async function load() {
      setLoadingIssues(true);
      setError(null);
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/rewards/issues", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as RewardResponse;
        if (!res.ok || !json.issues) {
          throw new Error(json.error ?? "Failed to load rewards.");
        }
        if (!canceled) setIssues(json.issues);
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : "Failed to load rewards.");
      } finally {
        if (!canceled) setLoadingIssues(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [user]);

  const active = useMemo(() => issues.filter((i) => i.status === "issued"), [issues]);
  const history = useMemo(() => issues.filter((i) => i.status !== "issued"), [issues]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Badge color="emerald">Rewards</Badge>
          <Heading level={1} className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Your redeemed rewards
          </Heading>
          <Text className="max-w-2xl text-zinc-200">
            Show active rewards in person to staff. They&apos;ll mark them as used in the business console.
          </Text>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button href="/rewards" outline>
            Browse rewards
          </Button>
          <Button href="/profile" color="emerald">
            Profile
          </Button>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Active rewards</div>
          <div className="text-xs text-zinc-400">{loading || loadingIssues ? "Loading…" : `${active.length} active`}</div>
        </div>
        {loadingIssues ? (
          <div className="space-y-2 text-sm text-zinc-400">Loading your rewards…</div>
        ) : active.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-300">
            Nothing active right now. Redeem a reward to see it here.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {active.map((issue) => (
              <div key={issue.id} className="space-y-2 rounded-2xl border border-white/10 bg-black/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {issue.title ?? issue.dealId ?? "Reward"}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {issue.businessName ?? issue.businessId ?? "Partner"}
                    </div>
                  </div>
                  <StatusBadge status={issue.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span>Issued {formatDate(issue.issuedAt)}</span>
                  <span className="opacity-50">•</span>
                  <span>Expires {formatDate(issue.expiresAt)}</span>
                </div>
                <div className="text-xs text-zinc-300">
                  Staff can see this reward in their console; they’ll mark it used when you show up. No code needed.
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white">History</div>
          <div className="text-xs text-zinc-400">{loadingIssues ? "Loading…" : `${history.length} past rewards`}</div>
        </div>
        {loadingIssues ? (
          <div className="space-y-2 text-sm text-zinc-400">Loading history…</div>
        ) : history.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-300">
            No redeemed rewards in your history yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="min-w-full text-sm">
              <thead className="bg-black/40 text-left text-xs uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-4 py-2">Reward</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Issued</th>
                  <th className="px-4 py-2">Used/Expired</th>
                  <th className="px-4 py-2 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {history.map((issue) => (
                  <tr key={issue.id} className="border-t border-white/5">
                    <td className="px-4 py-2">
                      <div className="font-semibold text-white">{issue.title ?? issue.dealId ?? "Reward"}</div>
                      <div className="text-xs text-zinc-400">
                        {issue.businessName ?? issue.businessId ?? "Partner"}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={issue.status} />
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">{formatDate(issue.issuedAt)}</td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {issue.status === "used" ? formatDate(issue.usedAt) : formatDate(issue.expiresAt)}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-emerald-200">{issue.code ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
