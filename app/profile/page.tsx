"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import {
  Timestamp,
  collection,
  getDocs,
  orderBy,
  query,
  where,
  limit,
} from "firebase/firestore";
import { useRequireAuth } from "@/lib/auth/routeGuards";
import { firebaseAuth } from "@/lib/firebase/client";
import { useAdminStatus } from "@/lib/auth/admin";
import { firestore } from "@/lib/firebase/client";
import { useBusinessAccess } from "@/lib/auth/business";
import { Button } from "@/ui-kit/button";
import PublicShell from "@/app/_components/PublicNav";

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading } = useRequireAuth("/signin");
  const [signingOut, setSigningOut] = useState(false);
  const { isAdmin, loading: adminLoading } = useAdminStatus();
  const { membership, loading: bizLoading } = useBusinessAccess();
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<
    Array<{
      id: string;
      type: string;
      pointsDelta?: number;
      amountCents?: number;
      createdAt?: Date;
      causeTitle?: string;
      businessName?: string;
      status?: string;
    }>
  >([]);
  const [donations, setDonations] = useState<
    Array<{
      id: string;
      amountCents?: number;
      points?: number;
      createdAt?: Date;
      causeTitle?: string;
      businessName?: string;
    }>
  >([]);
  const [rewardIssues, setRewardIssues] = useState<
    Array<{
      id: string;
      status?: string;
      code?: string;
      dealId?: string;
      businessId?: string;
      expiresAt?: Date;
      issuedAt?: Date;
    }>
  >([]);

  async function onSignOut() {
    setSigningOut(true);
    await signOut(firebaseAuth);
    router.replace("/signin");
  }

  useEffect(() => {
    if (!user) return;
    const currentUser = user;
    let canceled = false;
    async function load() {
      setStatsLoading(true);
      setStatsError(null);
      try {
        const txSnap = await getDocs(
          query(
            collection(firestore, "transactions"),
            where("userId", "==", currentUser.uid),
            orderBy("createdAt", "desc"),
            limit(50),
          ),
        );
        const donationSnap = await getDocs(
          query(
            collection(firestore, "donations"),
            where("userId", "==", currentUser.uid),
            orderBy("createdAt", "desc"),
            limit(50),
          ),
        );
        const rewardSnap = await getDocs(
          query(
            collection(firestore, "reward_issues"),
            where("userId", "==", currentUser.uid),
            orderBy("issuedAt", "desc"),
            limit(20),
          ),
        );

        const toDate = (val: unknown): Date | undefined => {
          if (!val) return undefined;
          if (val instanceof Date) return val;
          if (val instanceof Timestamp) return val.toDate();
          if (typeof val === "object" && val !== null && "_seconds" in val) {
            const ts = val as { _seconds: number; _nanoseconds?: number };
            return new Date(ts._seconds * 1000 + Math.floor((ts._nanoseconds ?? 0) / 1_000_000));
          }
          return undefined;
        };

        if (!canceled) {
          setTransactions(
            txSnap.docs.map((doc) => {
              const d = doc.data();
              return {
                id: doc.id,
                type: d.type,
                pointsDelta: d.pointsDelta,
                amountCents: d.amountCents,
                createdAt: toDate(d.createdAt),
                causeTitle: d.causeTitle ?? d.causeId,
                businessName: d.businessName ?? d.businessId,
                status: d.status,
              };
            }),
          );
          setDonations(
            donationSnap.docs.map((doc) => {
              const d = doc.data();
              return {
                id: doc.id,
                amountCents: d.amountCents,
                points: d.points,
                createdAt: toDate(d.createdAt),
                causeTitle: d.causeTitle ?? d.causeId,
                businessName: d.businessName ?? d.businessId,
              };
            }),
          );
          setRewardIssues(
            rewardSnap.docs.map((doc) => {
              const d = doc.data();
              return {
                id: doc.id,
                status: d.status,
                code: d.code,
                dealId: d.dealId,
                businessId: d.businessId,
                expiresAt: toDate(d.expiresAt),
                issuedAt: toDate(d.issuedAt),
              };
            }),
          );
        }
      } catch (err) {
        if (!canceled) {
          setStatsError(err instanceof Error ? err.message : "Failed to load activity.");
        }
      } finally {
        if (!canceled) setStatsLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [user]);

  const lifetimePoints = useMemo(() => {
    return transactions.reduce(
      (sum, tx) =>
        typeof tx.pointsDelta === "number" && tx.pointsDelta > 0 ? sum + tx.pointsDelta : sum,
      0,
    );
  }, [transactions]);

  const currentPoints = useMemo(() => {
    return transactions.reduce(
      (sum, tx) =>
        tx.status === "completed" && typeof tx.pointsDelta === "number"
          ? sum + tx.pointsDelta
          : sum,
      0,
    );
  }, [transactions]);

  const spentCents = useMemo(() => {
    return donations.reduce((sum, d) => sum + (d.amountCents ?? 0), 0);
  }, [donations]);

  const causeTotals = useMemo(() => {
    const map = new Map<string, { amountCents: number; points: number }>();
    donations.forEach((d) => {
      const key = d.causeTitle ?? "Unknown cause";
      const entry = map.get(key) ?? { amountCents: 0, points: 0 };
      entry.amountCents += d.amountCents ?? 0;
      entry.points += d.points ?? 0;
      map.set(key, entry);
    });
    return Array.from(map.entries()).map(([causeTitle, entry]) => ({
      causeTitle,
      ...entry,
    }));
  }, [donations]);

  const formatMoney = (cents?: number) =>
    typeof cents === "number" ? `$${(cents / 100).toFixed(2)}` : "—";

  const recentCauses = useMemo(() => causeTotals.slice(0, 5), [causeTotals]);

  if (loading || !user) {
    return (
      <PublicShell contentClassName="max-w-5xl">
        <div className="mx-auto flex max-w-5xl items-center justify-center py-12">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-200">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-emerald-300" />
            Loading your profile…
          </div>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell contentClassName="w-full max-w-5xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
              Profile
            </span>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Hi <span className="block break-all">{user.email}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
              {!adminLoading && isAdmin ? (
                <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                  Admin
                </span>
              ) : null}
              {!bizLoading && membership ? (
                <span className="inline-flex items-center rounded-full border border-emerald-300/40 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                  {membership.role} · {membership.businessId}
                </span>
              ) : null}
            </div>
          </div>
          <Button outline onClick={onSignOut} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Lifetime points" value={lifetimePoints} loading={statsLoading} />
          <StatCard label="Current points" value={currentPoints} loading={statsLoading} />
          <StatCard label="Total donated" value={formatMoney(spentCents)} loading={statsLoading} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <DataCard
            title="Recent donations"
            loading={statsLoading}
            emptyLabel="No donations yet."
            items={donations.slice(0, 5).map((d) => ({
              id: d.id,
              primary: d.causeTitle ?? "Donation",
              secondary: d.businessName ?? "",
              meta: d.createdAt?.toLocaleDateString() ?? "—",
              value: formatMoney(d.amountCents),
            }))}
          />

          <DataCard
            title="Redeemed items"
            loading={statsLoading}
            emptyLabel="No redemptions yet."
            items={rewardIssues.slice(0, 5).map((r) => ({
              id: r.id,
              primary: r.dealId ?? "Reward",
              secondary: r.status ?? "",
              meta: r.expiresAt ? `Expires ${r.expiresAt.toLocaleDateString()}` : "",
              value: r.status === "used" ? "Used" : r.status === "expired" ? "Expired" : "Active",
            }))}
          />
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-zinc-200">
          {statsError ? (
            <div className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-100">
              {statsError}
            </div>
          ) : null}
          <div className="grid gap-2 text-xs text-zinc-400">
            <div>Transactions loaded: {transactions.length}</div>
            <div>Donations loaded: {donations.length}</div>
            <div>Rewards issued: {rewardIssues.length}</div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-white">
          <div className="font-medium">Transaction history</div>
          {statsLoading ? (
            <div className="mt-2 space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="mt-2 text-zinc-400">No activity yet.</div>
          ) : (
            <div className="mt-3 space-y-2">
              {transactions.slice(0, 10).map((tx) => (
                <div
                  key={tx.id}
                  className="grid grid-cols-4 gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs"
                >
                  <div className="font-semibold capitalize">{tx.type}</div>
                  <div>{tx.createdAt?.toLocaleDateString() ?? "—"}</div>
                  <div>
                    {typeof tx.amountCents === "number" ? formatMoney(tx.amountCents) : null}
                    {typeof tx.pointsDelta === "number"
                      ? ` · ${tx.pointsDelta > 0 ? "+" : ""}${tx.pointsDelta} pts`
                      : null}
                  </div>
                  <div className="text-right">
                    {tx.causeTitle ?? tx.businessName ?? tx.status ?? "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-white">
          <div className="font-medium">Recently donated causes</div>
          {recentCauses.length === 0 ? (
            <div className="mt-2 text-zinc-400">No causes yet.</div>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {recentCauses.map((cause) => (
                <div
                  key={cause.causeTitle}
                  className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs"
                >
                  <div className="font-semibold">{cause.causeTitle}</div>
                  <div className="text-zinc-400">
                    {formatMoney(cause.amountCents)} · {cause.points} pts
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
          <Link className="underline" href="/">
            Back to landing
          </Link>
          <span className="opacity-50">•</span>
          <Link className="underline" href="/rewards">
            Browse rewards
          </Link>
          {!adminLoading && isAdmin ? (
            <>
              <span className="opacity-50">•</span>
              <Link className="underline" href="/admin">
                Admin dashboard
              </Link>
            </>
          ) : null}
        </div>
    </PublicShell>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">
        {loading ? <Skeleton className="h-7 w-16" /> : value}
      </div>
    </div>
  );
}

function DataCard({
  title,
  loading,
  emptyLabel,
  items,
}: {
  title: string;
  loading: boolean;
  emptyLabel: string;
  items: { id: string; primary: string; secondary?: string; meta?: string; value?: string }[];
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white">
      <div className="font-medium">{title}</div>
      {loading ? (
        <div className="mt-2 space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-2 text-zinc-400">{emptyLabel}</div>
      ) : (
        <div className="mt-2 space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-3 py-2"
            >
              <div>
                <div className="text-sm font-semibold text-white">{item.primary}</div>
                {item.secondary ? (
                  <div className="text-xs text-zinc-400">{item.secondary}</div>
                ) : null}
                {item.meta ? <div className="text-xs text-zinc-500">{item.meta}</div> : null}
              </div>
              <div className="text-xs text-emerald-200">{item.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/10 ${className ?? ""}`} />;
}
