"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import confetti from "canvas-confetti";
import {
  Timestamp,
  collection,
  doc,
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
import GiveawayProgressCard from "@/app/_components/GiveawayProgressCard";

export default function ProfilePage() {
  const router = useRouter();
  const pathname = usePathname();
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
  const [referralsLoading, setReferralsLoading] = useState(true);
  const [referralsError, setReferralsError] = useState<string | null>(null);
  const [referralsConfig, setReferralsConfig] = useState<{
    enabled: boolean;
    inviterPoints: number;
    invitedPoints: number;
  }>({
    enabled: false,
    inviterPoints: 0,
    invitedPoints: 0,
  });
  const [referralInviteLink, setReferralInviteLink] = useState<string | null>(null);
  const [referralsStats, setReferralsStats] = useState<{ invitedUsers: number; inviterPointsAwarded: number }>({
    invitedUsers: 0,
    inviterPointsAwarded: 0,
  });
  const [creatingReferralLink, setCreatingReferralLink] = useState(false);
  const [copiedReferral, setCopiedReferral] = useState(false);
  const [signupReferralPoints, setSignupReferralPoints] = useState<number | null>(null);
  const referralConfettiFired = useRef(false);
  const [notifications, setNotifications] = useState<
    Array<{
      id: string;
      title: string;
      description: string;
      color: "amber" | "emerald" | "blue" | "red" | "zinc";
    }>
  >([]);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>([]);

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

    const transactionsQuery = query(
      collection(firestore, "transactions"),
      where("userId", "==", currentUser.uid),
      orderBy("createdAt", "desc"),
      limit(50),
    );

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
    const unsubscribeTransactions = onSnapshot(
      transactionsQuery,
      (txSnap) => {
        if (canceled) return;
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
        setTransactionsLoading(false);
      },
      (err) => {
        if (!canceled) {
          setStatsError(err.message);
          setTransactionsLoading(false);
        }
      },
    );

    return () => {
      canceled = true;
      unsubscribeTransactions();
      unsubscribeDonations();
      unsubscribeRewards();
    };
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const signupFlag = params.get("referralSignup");
    const referralPointsRaw = params.get("referralPoints");
    const referralPoints = Number(referralPointsRaw);
    if (signupFlag !== "1" || !Number.isFinite(referralPoints) || referralPoints <= 0) return;
    if (referralConfettiFired.current) return;
    referralConfettiFired.current = true;
    setSignupReferralPoints(Math.floor(referralPoints));

    const colors = ["#34d399", "#10b981", "#6ee7b7", "#a7f3d0"];
    const shoot = (originX: number) =>
      confetti({
        particleCount: 90,
        spread: 70,
        startVelocity: 36,
        gravity: 0.9,
        decay: 0.92,
        origin: { x: originX, y: 0.2 },
        colors,
      });
    shoot(0.2);
    shoot(0.8);
    window.setTimeout(() => shoot(0.5), 280);

    // Remove one-time celebration params from URL.
    router.replace(pathname);
  }, [pathname, router]);

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

  useEffect(() => {
    if (!user) return;
    const currentUser = user;
    let canceled = false;
    async function loadReferrals() {
      setReferralsLoading(true);
      setReferralsError(null);
      try {
        const idToken = await currentUser.getIdToken();
        const [configRes, meRes] = await Promise.all([
          fetch("/api/referrals/config"),
          fetch("/api/referrals/me", {
            headers: { Authorization: `Bearer ${idToken}` },
          }),
        ]);
        const configJson = (await configRes.json()) as {
          enabled?: boolean;
          inviterPoints?: number;
          invitedPoints?: number;
          error?: string;
        };
        const meJson = (await meRes.json()) as {
          inviteCode?: string | null;
          invitedUsers?: number;
          inviterPointsAwarded?: number;
          error?: string;
        };
        if (!configRes.ok) {
          throw new Error(configJson.error ?? "Failed to load referral settings.");
        }
        if (!meRes.ok) {
          throw new Error(meJson.error ?? "Failed to load referral stats.");
        }
        if (canceled) return;
        const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin).replace(/\/$/, "");
        setReferralsConfig({
          enabled: configJson.enabled === true,
          inviterPoints: Number(configJson.inviterPoints ?? 0),
          invitedPoints: Number(configJson.invitedPoints ?? 0),
        });
        setReferralInviteLink(
          meJson.inviteCode ? `${origin}/signup?ref=${encodeURIComponent(meJson.inviteCode)}` : null,
        );
        setReferralsStats({
          invitedUsers: Number(meJson.invitedUsers ?? 0),
          inviterPointsAwarded: Number(meJson.inviterPointsAwarded ?? 0),
        });
      } catch (err) {
        if (!canceled) {
          setReferralsError(err instanceof Error ? err.message : "Failed to load referrals.");
        }
      } finally {
        if (!canceled) setReferralsLoading(false);
      }
    }
    void loadReferrals();
    return () => {
      canceled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const currentUser = user;
    let canceled = false;
    async function loadNotifications() {
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch("/api/users/notifications", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as {
          notifications?: Array<{
            id: string;
            title: string;
            description: string;
            color?: "amber" | "emerald" | "blue" | "red" | "zinc";
          }>;
        };
        if (!res.ok || !json.notifications || canceled) return;
        setNotifications(
          json.notifications.map((item) => ({
            ...item,
            color: item.color ?? "amber",
          })),
        );
      } catch {
        // Notifications are best effort only.
      }
    }
    void loadNotifications();
    return () => {
      canceled = true;
    };
  }, [user]);

  async function createReferralLink() {
    if (!user || creatingReferralLink) return;
    setCreatingReferralLink(true);
    setReferralsError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/referrals/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = (await res.json()) as { inviteLink?: string; error?: string };
      if (!res.ok || !json.inviteLink) throw new Error(json.error ?? "Failed to create invite link.");
      setReferralInviteLink(json.inviteLink);
    } catch (err) {
      setReferralsError(err instanceof Error ? err.message : "Failed to create invite link.");
    } finally {
      setCreatingReferralLink(false);
    }
  }

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
      <PublicShell contentClassName="w-full max-w-5xl space-y-8">
        {notifications
          .filter((item) => !dismissedNotificationIds.includes(item.id))
          .map((item) => {
            const tone =
              item.color === "emerald"
                ? {
                    wrap: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
                    text: "text-emerald-50",
                    button: "border-emerald-300/30 text-emerald-50",
                  }
                : item.color === "blue"
                  ? {
                      wrap: "border-blue-400/30 bg-blue-500/10 text-blue-100",
                      text: "text-blue-50",
                      button: "border-blue-300/30 text-blue-50",
                    }
                  : item.color === "red"
                    ? {
                        wrap: "border-red-400/30 bg-red-500/10 text-red-100",
                        text: "text-red-50",
                        button: "border-red-300/30 text-red-50",
                      }
                    : item.color === "zinc"
                      ? {
                          wrap: "border-white/20 bg-white/10 text-zinc-100",
                          text: "text-zinc-50",
                          button: "border-white/20 text-zinc-50",
                        }
                      : {
                          wrap: "border-amber-400/30 bg-amber-500/10 text-amber-100",
                          text: "text-amber-50",
                          button: "border-amber-300/30 text-amber-50",
                        };
            return (
            <div key={item.id} className={`w-full rounded-2xl border p-4 ${tone.wrap}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{item.title}</div>
                  <div className={`mt-1 text-sm ${tone.text}`}>{item.description}</div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDismissedNotificationIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]))
                  }
                  className={`rounded-md border px-2 py-1 text-xs ${tone.button}`}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )})}

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/20 text-lg font-bold text-emerald-300">
                {(user.email?.[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                  Welcome back
                </h1>
                <p className="truncate text-sm text-zinc-400">{user.email}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-12">
              {!adminLoading && isAdmin ? (
                <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  Admin
                </span>
              ) : null}
              {!bizLoading && membership ? (
                <span className="inline-flex items-center rounded-full border border-emerald-300/40 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200">
                  {membership.role} · {membership.businessId}
                </span>
              ) : null}
            </div>
          </div>
          <Button outline onClick={onSignOut} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Lifetime points"
            value={lifetimePoints}
            loading={transactionsLoading}
            accent="emerald"
          />
          <StatCard
            label="Current points"
            value={currentPoints}
            loading={transactionsLoading}
            accent="sky"
          />
          <StatCard
            label="Total supported"
            value={formatMoney(spentCents)}
            loading={donationsLoading}
            accent="amber"
          />
        </div>

        {signupReferralPoints && signupReferralPoints > 0 ? (
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
            You just earned <span className="font-semibold">{signupReferralPoints} points</span> from a referral invite signup.
          </div>
        ) : null}

        <GiveawayProgressCard />

        {/* ── Invite Friends ── */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white">
          <h2 className="text-base font-semibold">Invite friends</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Share your personal link and earn points when friends sign up.
          </p>
          {referralsError ? (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
              {referralsError}
            </div>
          ) : null}
          {!referralsLoading && !referralsConfig.enabled ? (
            <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400">
              Referral invites are currently disabled.
            </div>
          ) : null}
          {referralsConfig.enabled ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MiniStat label="You earn" value={`${referralsConfig.inviterPoints} pts`} sub="per invite" />
                <MiniStat label="Friend earns" value={`${referralsConfig.invitedPoints} pts`} sub="on signup" />
                <MiniStat label="Successful invites" value={referralsStats.invitedUsers} />
                <MiniStat label="Points from invites" value={referralsStats.inviterPointsAwarded} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  outline
                  onClick={() => void createReferralLink()}
                  disabled={creatingReferralLink}
                >
                  {creatingReferralLink ? "Generating..." : referralInviteLink ? "Regenerate link" : "Generate invite link"}
                </Button>
                {referralInviteLink ? (
                  <Button
                    outline
                    onClick={async () => {
                      await navigator.clipboard.writeText(referralInviteLink);
                      setCopiedReferral(true);
                      window.setTimeout(() => setCopiedReferral(false), 1200);
                    }}
                  >
                    {copiedReferral ? "Copied!" : "Copy link"}
                  </Button>
                ) : null}
              </div>
              {referralInviteLink ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 font-mono text-xs break-all text-zinc-300">
                  {referralInviteLink}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        {/* ── Activity Summary ── */}
        {statsError ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
            {statsError}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400">
            {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400">
            {donations.length} donation{donations.length !== 1 ? "s" : ""}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400">
            {rewardIssues.length} reward{rewardIssues.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ── Tabbed History ── */}
        <div className="rounded-3xl border border-white/10 bg-white/5 text-sm text-white">
          <div className="flex items-center gap-1 border-b border-white/10 px-6 pt-4">
            <button
              type="button"
              onClick={() => setActiveTab("donations")}
              className={[
                "rounded-t-lg px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition",
                activeTab === "donations"
                  ? "border-b-2 border-emerald-400 bg-white/5 text-emerald-200"
                  : "text-zinc-400 hover:text-zinc-200",
              ].join(" ")}
            >
              Support
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("rewards")}
              className={[
                "rounded-t-lg px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition",
                activeTab === "rewards"
                  ? "border-b-2 border-emerald-400 bg-white/5 text-emerald-200"
                  : "text-zinc-400 hover:text-zinc-200",
              ].join(" ")}
            >
              Rewards
            </button>
          </div>

          {activeTab === "donations" ? (
            <div className="p-1">
              {donationsLoading ? (
                <div className="p-6 text-zinc-400">Loading support…</div>
              ) : donations.length === 0 ? (
                <div className="p-6 text-center text-zinc-500">No support history yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[11px] uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-5 py-3 font-medium">Date</th>
                        <th className="px-5 py-3 font-medium">Cause</th>
                        <th className="px-5 py-3 font-medium">Business</th>
                        <th className="px-5 py-3 font-medium text-right">Amount</th>
                        <th className="px-5 py-3 font-medium text-right">Points</th>
                        <th className="px-5 py-3 font-medium">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {donations.map((donation) => (
                        <tr key={donation.id} className="transition hover:bg-white/[0.03]">
                          <td className="whitespace-nowrap px-5 py-3 text-zinc-400">
                            {donation.createdAt?.toLocaleDateString() ?? "—"}
                          </td>
                          <td className="px-5 py-3 font-medium text-white">
                            {donation.causeTitle ?? "Support"}
                          </td>
                          <td className="px-5 py-3 text-zinc-300">
                            {donation.businessName ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-right font-medium text-white">
                            {formatMoney(donation.amountCents)}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-right font-medium text-emerald-300">
                            +{donation.points ?? 0}
                          </td>
                          <td className="px-5 py-3">
                            {donation.receiptUrl ? (
                              <a
                                href={donation.receiptUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-emerald-200 transition hover:bg-white/10"
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
          ) : (
            <div className="p-1">
              {rewardsLoading ? (
                <div className="p-6 text-zinc-400">Loading rewards…</div>
              ) : rewardIssues.length === 0 ? (
                <div className="p-6 text-center text-zinc-500">No rewards yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[11px] uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-5 py-3 font-medium">Reward</th>
                        <th className="px-5 py-3 font-medium">Status</th>
                        <th className="px-5 py-3 font-medium">Issued</th>
                        <th className="px-5 py-3 font-medium">Expiry</th>
                        <th className="px-5 py-3 font-medium">Code</th>
                        <th className="px-5 py-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {rewardIssues.map((reward) => (
                        <tr key={reward.id} className="transition hover:bg-white/[0.03]">
                          <td className="px-5 py-3 font-medium text-white">
                            {reward.rewardTitle ?? reward.dealId ?? "Reward"}
                          </td>
                          <td className="px-5 py-3">
                            <span className={[
                              "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                              reward.status === "issued"
                                ? "bg-emerald-400/15 text-emerald-300"
                                : reward.status === "used"
                                  ? "bg-zinc-400/15 text-zinc-400"
                                  : "bg-red-400/15 text-red-300",
                            ].join(" ")}>
                              {reward.status ?? "—"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-zinc-400">
                            {reward.issuedAt?.toLocaleDateString() ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-zinc-400">
                            {reward.expiresAt ? reward.expiresAt.toLocaleDateString() : "No expiry"}
                          </td>
                          <td className="px-5 py-3 font-mono text-emerald-200">{reward.code ?? "—"}</td>
                          <td className="px-5 py-3">
                            {reward.id ? (
                              <button
                                type="button"
                                onClick={() => openReceipt(reward.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-emerald-200 transition hover:bg-white/10"
                              >
                                Details
                              </button>
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
          )}
        </div>

        {/* ── Footer Links ── */}
        <div className="flex flex-wrap items-center gap-2 pb-4">
          <Link
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
            href="/"
          >
            Back to home
          </Link>
          <Link
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
            href="/rewards"
          >
            Browse rewards
          </Link>
          {!adminLoading && isAdmin ? (
            <Link
              className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-medium text-emerald-200 transition hover:bg-emerald-400/20"
              href="/admin"
            >
              Admin dashboard
            </Link>
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
  accent = "emerald",
}: {
  label: string;
  value: React.ReactNode;
  loading: boolean;
  accent?: "emerald" | "sky" | "amber";
}) {
  const accentMap = {
    emerald: "border-emerald-400/20 bg-emerald-400/5",
    sky: "border-sky-400/20 bg-sky-400/5",
    amber: "border-amber-400/20 bg-amber-400/5",
  };
  const valueColor = {
    emerald: "text-emerald-300",
    sky: "text-sky-300",
    amber: "text-amber-300",
  };
  return (
    <div className={`rounded-2xl border p-5 ${accentMap[accent]}`}>
      <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${valueColor[accent]}`}>
        {loading ? <Skeleton className="h-8 w-20" /> : value}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-white">
        {value}
        {sub ? <span className="ml-1 text-xs font-normal text-zinc-500">{sub}</span> : null}
      </div>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/10 ${className ?? ""}`} />;
}
