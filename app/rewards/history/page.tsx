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
  redeemLocationName?: string | null;
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
            redeemLocationName:
              data.redeemLocationName ?? data.displayPayload?.locationName ?? null,
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
        if (!canceled) setError(err instanceof Error ? err.message : "Failed to load support.");
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
      {/* ── Header ── */}
      <header className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-3">
            <Badge color="emerald">Rewards</Badge>
            <Heading level={1} className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Your redeemed rewards
            </Heading>
            <Text className="max-w-2xl text-zinc-300">
              Show active rewards in person to staff. They&apos;ll mark them as used in the business console.
            </Text>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button href="/rewards" outline>
              Browse rewards
            </Button>
            <Button href="/profile" color="emerald">
              Profile
            </Button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-1.5 text-xs font-semibold text-emerald-300">
            {loading || loadingIssues ? "Loading…" : `${active.length} active`}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-zinc-400">
            {loadingIssues ? "Loading…" : `${history.length} past`}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-zinc-400">
            {loadingDonations ? "Loading…" : `${donations.length} donation${donations.length !== 1 ? "s" : ""}`}
          </span>
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

      {/* ── Active Rewards ── */}
      <section className="rounded-3xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-base font-semibold text-white">Active rewards</h2>
        </div>
        <div className="p-5">
          {loadingIssues ? (
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 2 }).map((_, idx) => (
                <div key={idx} className="h-32 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
              ))}
            </div>
          ) : active.length === 0 ? (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] px-5 py-6 text-center text-sm text-zinc-500">
              Nothing active right now. Redeem a reward to see it here.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {active.map((issue) => (
                <div key={issue.id} className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.04] p-5 transition hover:border-emerald-400/30">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-white">
                        {issue.title ?? issue.dealId ?? "Reward"}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-400">
                        {issue.businessName ?? issue.businessId ?? "Partner"}
                        {issue.redeemLocationName ? ` · ${issue.redeemLocationName}` : ""}
                      </div>
                    </div>
                    <StatusBadge status={issue.status} />
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                    <span>Issued {formatDate(issue.issuedAt)}</span>
                    <span className="text-zinc-700">·</span>
                    <span>
                      {issue.expiresAt ? `Expires ${formatDate(issue.expiresAt)}` : "No expiry"}
                    </span>
                  </div>
                  <div className="mt-3 text-xs text-zinc-400">
                    Show this code or receipt at the location so staff can mark it used.
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 font-mono text-sm font-semibold text-emerald-300">{issue.code ?? "—"}</span>
                    <a
                      className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-emerald-200 transition hover:bg-white/10"
                      href={`/rewards/receipt/${issue.id}`}
                    >
                      View receipt
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── History Table ── */}
      <section className="rounded-3xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-base font-semibold text-white">History</h2>
        </div>
        <div className="p-1">
          {loadingIssues ? (
            <div className="p-6 text-sm text-zinc-400">Loading history…</div>
          ) : history.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500">
              No redeemed rewards in your history yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Reward</th>
                    <th className="px-5 py-3 text-left font-medium">Status</th>
                    <th className="px-5 py-3 text-left font-medium">Issued</th>
                    <th className="px-5 py-3 text-left font-medium">Location</th>
                    <th className="px-5 py-3 text-left font-medium">Used/Expiry</th>
                    <th className="px-5 py-3 text-right font-medium">Code</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {history.map((issue) => (
                    <tr key={issue.id} className="transition hover:bg-white/[0.03]">
                      <td className="px-5 py-3">
                        <div className="font-medium text-white">{issue.title ?? issue.dealId ?? "Reward"}</div>
                        <div className="text-xs text-zinc-500">
                          {issue.businessName ?? issue.businessId ?? "Partner"}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={issue.status} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-zinc-400">{formatDate(issue.issuedAt)}</td>
                      <td className="px-5 py-3 text-xs text-zinc-400">
                        {issue.redeemLocationName ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-zinc-400">
                        {issue.status === "used"
                          ? formatDate(issue.usedAt)
                          : issue.expiresAt
                            ? formatDate(issue.expiresAt)
                            : "No expiry"}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs text-emerald-300">{issue.code ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Donation Receipts Table ── */}
      <section className="rounded-3xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-base font-semibold text-white">Support receipts</h2>
        </div>
        <div className="p-1">
          {loadingDonations ? (
            <div className="p-6 text-sm text-zinc-400">Loading support…</div>
          ) : donations.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500">
              No support yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Date</th>
                    <th className="px-5 py-3 text-left font-medium">Cause</th>
                    <th className="px-5 py-3 text-left font-medium">Business</th>
                    <th className="px-5 py-3 text-right font-medium">Amount</th>
                    <th className="px-5 py-3 text-right font-medium">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {donations.map((donation) => (
                    <tr key={donation.id} className="transition hover:bg-white/[0.03]">
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-zinc-400">
                        {formatDate(donation.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-medium text-white">
                          {donation.causeTitle ?? "Support"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-zinc-400">
                        {donation.businessName ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right text-xs font-medium text-white">
                        {formatMoney(donation.amountCents)}
                      </td>
                      <td className="px-5 py-3 text-right text-xs">
                        {donation.receiptUrl ? (
                          <a
                            href={donation.receiptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-emerald-200 transition hover:bg-white/10"
                          >
                            View
                          </a>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
