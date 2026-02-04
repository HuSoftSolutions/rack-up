"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Timestamp,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { Badge } from "@/ui-kit/badge";
import { Button } from "@/ui-kit/button";
import { Heading } from "@/ui-kit/heading";
import { Text } from "@/ui-kit/text";
import { useRequireAuth } from "@/lib/auth/routeGuards";
import { firestore } from "@/lib/firebase/client";

type RewardIssue = {
  id: string;
  dealId: string | null;
  businessId: string | null;
  code?: string | null;
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

type DonationRow = {
  id: string;
  amountCents: number | null;
  causeTitle: string | null;
  businessName: string | null;
  createdAt: string | null;
  receiptUrl: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatMoney(cents: number | null) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  const [donations, setDonations] = useState<DonationRow[]>([]);
  const [loadingDonations, setLoadingDonations] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [indexWarning, setIndexWarning] = useState(false);

  useEffect(() => {
    if (!user) return;
    const currentUser = user;
    let canceled = false;

    setLoadingIssues(true);
    setError(null);
    const rewardsQuery = query(
      collection(firestore, "reward_issues"),
      where("userId", "==", currentUser.uid),
      orderBy("issuedAt", "desc"),
      limit(50),
    );

    const unsubscribe = onSnapshot(
      rewardsQuery,
      (snap) => {
        if (canceled) return;
        const issues = snap.docs.map((doc) => {
          const data = doc.data();
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
          return {
            id: doc.id,
            dealId: data.dealId ?? null,
            businessId: data.businessId ?? null,
            code: data.code ?? null,
            status: (data.status as RewardIssue["status"]) ?? "issued",
            issuedAt: toIso(data.issuedAt),
            expiresAt: toIso(data.expiresAt),
            usedAt: toIso(data.usedAt),
            title: data.displayPayload?.title ?? data.title ?? null,
            businessName: data.displayPayload?.businessName ?? data.businessName ?? data.businessId ?? null,
          } satisfies RewardIssue;
        });
        setIssues(issues);
        setLoadingIssues(false);
      },
      (err) => {
        if (canceled) return;
        const message = err instanceof Error ? err.message : "Failed to load rewards.";
        const missingIndex = message.includes("FAILED_PRECONDITION") || message.includes("requires an index");
        if (missingIndex) setIndexWarning(true);
        setError(missingIndex ? null : message);
        setLoadingIssues(false);
      },
    );

    return () => {
      canceled = true;
      unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const currentUser = user;
    let canceled = false;

    async function loadDonations() {
      setLoadingDonations(true);
      try {
        const snap = await getDocs(
          query(
            collection(firestore, "donations"),
            where("userId", "==", currentUser.uid),
            orderBy("createdAt", "desc"),
            limit(20),
          ),
        );

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

        if (!canceled) {
          setDonations(
            snap.docs.map((doc) => {
              const d = doc.data();
              return {
                id: doc.id,
                amountCents: typeof d.amountCents === "number" ? d.amountCents : null,
                causeTitle: d.causeTitle ?? d.causeId ?? null,
                businessName: d.businessName ?? d.businessId ?? null,
                createdAt: toIso(d.createdAt),
                receiptUrl: d.stripe?.receiptUrl ?? null,
              };
            }),
          );
        }
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : "Failed to load donations.");
      } finally {
        if (!canceled) setLoadingDonations(false);
      }
    }

    void loadDonations();
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
      {indexWarning ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Realtime updates are limited because a required Firestore index is missing. Create a composite index for
          rewards (userId + issuedAt).
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
                  Show this code or receipt at the location so staff can mark it used.
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                  <span className="font-mono text-emerald-200">{issue.code ?? "—"}</span>
                  <a className="text-emerald-200 underline" href={`/rewards/receipt/${issue.id}`}>
                    View receipt
                  </a>
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

      <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Donation receipts</div>
          <div className="text-xs text-zinc-400">
            {loadingDonations ? "Loading…" : `${donations.length} donations`}
          </div>
        </div>
        {loadingDonations ? (
          <div className="space-y-2 text-sm text-zinc-400">Loading donations…</div>
        ) : donations.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-300">
            No donations yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="min-w-full text-sm">
              <thead className="bg-black/40 text-left text-xs uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Cause</th>
                  <th className="px-4 py-2">Business</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {donations.map((donation) => (
                  <tr key={donation.id} className="border-t border-white/5">
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {formatDate(donation.createdAt)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-semibold text-white">
                        {donation.causeTitle ?? "Donation"}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {donation.businessName ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {formatMoney(donation.amountCents)}
                    </td>
                    <td className="px-4 py-2 text-right text-xs">
                      {donation.receiptUrl ? (
                        <a
                          href={donation.receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-200 underline"
                        >
                          View receipt
                        </a>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
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
