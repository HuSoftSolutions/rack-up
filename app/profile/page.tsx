"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  onSnapshot,
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
import { Dialog, DialogBody, DialogTitle } from "@/ui-kit/dialog";
import PublicShell from "@/app/_components/PublicNav";

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading } = useRequireAuth("/signin");
  const [signingOut, setSigningOut] = useState(false);
  const { isAdmin, loading: adminLoading } = useAdminStatus();
  const { membership, loading: bizLoading } = useBusinessAccess();
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [donationsLoading, setDonationsLoading] = useState(true);
  const [rewardsLoading, setRewardsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"donations" | "rewards">("donations");
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptIssue, setReceiptIssue] = useState<{
    id: string;
    status: "issued" | "used" | "expired";
    issuedAt?: Date;
    expiresAt?: Date;
    usedAt?: Date;
    title?: string | null;
    businessName?: string | null;
    code?: string | null;
    userName?: string | null;
    userEmail?: string | null;
    usedBy?: { staffId?: string | null; staffName?: string | null; staffEmail?: string | null } | null;
  } | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
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
      receiptUrl?: string | null;
    }>
  >([]);
  const [rewardIssues, setRewardIssues] = useState<
    Array<{
      id: string;
      status?: string;
      code?: string;
      dealId?: string;
      rewardTitle?: string;
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
    setStatsError(null);
    setTransactionsLoading(true);
    setDonationsLoading(true);
    setRewardsLoading(true);

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

    async function loadTransactions() {
      try {
        const txSnap = await getDocs(
          query(
            collection(firestore, "transactions"),
            where("userId", "==", currentUser.uid),
            orderBy("createdAt", "desc"),
            limit(50),
          ),
        );
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
        }
      } catch (err) {
        if (!canceled) {
          setStatsError(err instanceof Error ? err.message : "Failed to load activity.");
        }
      } finally {
        if (!canceled) setTransactionsLoading(false);
      }
    }

    const donationQuery = query(
      collection(firestore, "donations"),
      where("userId", "==", currentUser.uid),
      orderBy("createdAt", "desc"),
      limit(50),
    );

    const rewardsQuery = query(
      collection(firestore, "reward_issues"),
      where("userId", "==", currentUser.uid),
      orderBy("issuedAt", "desc"),
      limit(20),
    );

    const unsubscribeDonations = onSnapshot(
      donationQuery,
      (donationSnap) => {
        if (canceled) return;
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
              receiptUrl: d.stripe?.receiptUrl ?? null,
            };
          }),
        );
        setDonationsLoading(false);
      },
      (err) => {
        if (!canceled) {
          setStatsError(err.message);
          setDonationsLoading(false);
        }
      },
    );

    const unsubscribeRewards = onSnapshot(
      rewardsQuery,
      (rewardSnap) => {
        if (canceled) return;
        setRewardIssues(
          rewardSnap.docs.map((doc) => {
            const d = doc.data();
            return {
              id: doc.id,
              status: d.status,
              code: d.code,
              dealId: d.dealId,
              rewardTitle: d.displayPayload?.title ?? d.title ?? d.dealId,
              businessId: d.businessId,
              expiresAt: toDate(d.expiresAt),
              issuedAt: toDate(d.issuedAt),
            };
          }),
        );
        setRewardsLoading(false);
      },
      (err) => {
        if (!canceled) {
          setStatsError(err.message);
          setRewardsLoading(false);
        }
      },
    );

    void loadTransactions();

    return () => {
      canceled = true;
      unsubscribeDonations();
      unsubscribeRewards();
    };
  }, [user]);

  useEffect(() => {
    if (!receiptOpen || !receiptId) return;
    const ref = doc(firestore, "reward_issues", receiptId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        if (!data) {
          setReceiptIssue(null);
          setReceiptError("Reward not found.");
          return;
        }
        setReceiptError(null);
        setReceiptIssue({
          id: snap.id,
          status: (data.status as "issued" | "used" | "expired") ?? "issued",
          issuedAt: data.issuedAt instanceof Timestamp ? data.issuedAt.toDate() : undefined,
          expiresAt: data.expiresAt instanceof Timestamp ? data.expiresAt.toDate() : undefined,
          usedAt: data.usedAt instanceof Timestamp ? data.usedAt.toDate() : undefined,
          title: data.displayPayload?.title ?? data.title ?? "Reward",
          businessName: data.displayPayload?.businessName ?? data.businessName ?? data.businessId,
          code: data.code ?? null,
          userName: data.userName ?? null,
          userEmail: data.userEmail ?? data.email ?? null,
          usedBy: data.usedBy ?? null,
        });
      },
      (err) => {
        setReceiptError(err.message);
      },
    );
    return () => unsubscribe();
  }, [receiptId, receiptOpen]);

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

  const formatMoney = (cents?: number) =>
    typeof cents === "number" ? `$${(cents / 100).toFixed(2)}` : "—";

  const formatDate = (date?: Date) => (date ? date.toLocaleString() : "—");

  const openReceipt = (id: string) => {
    setReceiptId(id);
    setReceiptOpen(true);
  };

  const receiptStatusText = receiptIssue
    ? receiptIssue.status === "used"
      ? `Marked used ${formatDate(receiptIssue.usedAt)}`
      : receiptIssue.status === "expired"
        ? `Expired ${formatDate(receiptIssue.expiresAt)}`
        : receiptIssue.expiresAt
          ? `Active until ${formatDate(receiptIssue.expiresAt)}`
          : "No expiry"
    : "";

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
    <>
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
          <StatCard label="Lifetime points" value={lifetimePoints} loading={transactionsLoading} />
          <StatCard label="Current points" value={currentPoints} loading={transactionsLoading} />
          <StatCard label="Total supported" value={formatMoney(spentCents)} loading={donationsLoading} />
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-zinc-200">
          {statsError ? (
            <div className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-100">
              {statsError}
            </div>
          ) : null}
          <div className="grid gap-2 text-xs text-zinc-400">
            <div>Transactions loaded: {transactions.length}</div>
            <div>Support loaded: {donations.length}</div>
            <div>Rewards issued: {rewardIssues.length}</div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-white">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("donations")}
              className={[
                "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition",
                activeTab === "donations"
                  ? "bg-emerald-400/20 text-emerald-100"
                  : "bg-white/5 text-zinc-300 hover:bg-white/10",
              ].join(" ")}
            >
              Support
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("rewards")}
              className={[
                "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition",
                activeTab === "rewards"
                  ? "bg-emerald-400/20 text-emerald-100"
                  : "bg-white/5 text-zinc-300 hover:bg-white/10",
              ].join(" ")}
            >
              Rewards
            </button>
          </div>

          {activeTab === "donations" ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
              {donationsLoading ? (
                <div className="p-4 text-zinc-400">Loading support…</div>
              ) : donations.length === 0 ? (
                <div className="p-4 text-zinc-400">No support yet.</div>
              ) : (
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-black/40 text-xs uppercase tracking-wide text-zinc-400">
                    <tr>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Cause</th>
                      <th className="px-4 py-2">Business</th>
                      <th className="px-4 py-2">Amount</th>
                      <th className="px-4 py-2">Points</th>
                      <th className="px-4 py-2">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {donations.map((donation) => (
                      <tr key={donation.id} className="border-t border-white/10">
                        <td className="px-4 py-2 text-zinc-300">
                          {donation.createdAt?.toLocaleDateString() ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-white">
                          {donation.causeTitle ?? "Support"}
                        </td>
                        <td className="px-4 py-2 text-zinc-300">
                          {donation.businessName ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-zinc-200">
                          {formatMoney(donation.amountCents)}
                        </td>
                        <td className="px-4 py-2 text-zinc-200">
                          {donation.points ?? "—"}
                        </td>
                        <td className="px-4 py-2">
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
              )}
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
              {rewardsLoading ? (
                <div className="p-4 text-zinc-400">Loading rewards…</div>
              ) : rewardIssues.length === 0 ? (
                <div className="p-4 text-zinc-400">No rewards yet.</div>
              ) : (
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-black/40 text-xs uppercase tracking-wide text-zinc-400">
                    <tr>
                      <th className="px-4 py-2">Reward</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Issued</th>
                      <th className="px-4 py-2">Expiry</th>
                      <th className="px-4 py-2">Code</th>
                      <th className="px-4 py-2">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rewardIssues.map((reward) => (
                      <tr key={reward.id} className="border-t border-white/10">
                        <td className="px-4 py-2 text-white">
                          {reward.rewardTitle ?? reward.dealId ?? "Reward"}
                        </td>
                        <td className="px-4 py-2 text-zinc-300 capitalize">
                          {reward.status ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-zinc-300">
                          {reward.issuedAt?.toLocaleDateString() ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-zinc-300">
                          {reward.expiresAt ? reward.expiresAt.toLocaleDateString() : "No expiry"}
                        </td>
                        <td className="px-4 py-2 text-emerald-200">{reward.code ?? "—"}</td>
                        <td className="px-4 py-2">
                          {reward.id ? (
                            <button
                              type="button"
                              onClick={() => openReceipt(reward.id)}
                              className="text-emerald-200 underline"
                            >
                              View status
                            </button>
                          ) : (
                            <span className="text-zinc-500">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
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

      <Dialog open={receiptOpen} onClose={() => setReceiptOpen(false)} size="lg">
        <div className="flex items-start justify-between gap-4">
          <DialogTitle>Reward receipt</DialogTitle>
          <button
            type="button"
            className="text-xs font-semibold text-zinc-500 hover:text-zinc-200"
            onClick={() => setReceiptOpen(false)}
          >
            Close
          </button>
        </div>
        <DialogBody className="space-y-4 text-sm text-white">
          {receiptError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {receiptError}
            </div>
          ) : !receiptIssue ? (
            <div className="text-zinc-400">Loading receipt…</div>
          ) : (
            <>
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <div className="text-xs uppercase tracking-wide text-zinc-400">
                  {receiptIssue.businessName ?? "Partner"}
                </div>
                <div className="text-lg font-semibold text-white">
                  {receiptIssue.title ?? "Reward"}
                </div>
                <div className="text-xs text-zinc-500">Receipt #{receiptIssue.id}</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <div className="text-sm font-semibold text-white">Status</div>
                <div className="text-sm text-zinc-300">{receiptStatusText}</div>
                <div className="mt-2 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
                  <div>Issued: {formatDate(receiptIssue.issuedAt)}</div>
                  <div>
                    {receiptIssue.expiresAt
                      ? `Expires: ${formatDate(receiptIssue.expiresAt)}`
                      : "No expiry"}
                  </div>
                  <div>Used: {formatDate(receiptIssue.usedAt)}</div>
                  <div>Code: {receiptIssue.code ?? "—"}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <div className="text-sm font-semibold text-white">For staff</div>
                <div className="mt-1 text-sm text-zinc-300">
                  Confirm this screen with the customer and mark it used in the business console.
                </div>
                <div className="mt-2 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
                  <div>Customer: {receiptIssue.userName ?? "—"}</div>
                  <div>Email: {receiptIssue.userEmail ?? "—"}</div>
                  <div>
                    Verifier: {receiptIssue.usedBy?.staffName ?? receiptIssue.usedBy?.staffId ?? "—"}
                  </div>
                  <div>Verifier email: {receiptIssue.usedBy?.staffEmail ?? "—"}</div>
                </div>
              </div>
            </>
          )}
        </DialogBody>
      </Dialog>
    </>
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

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/10 ${className ?? ""}`} />;
}
