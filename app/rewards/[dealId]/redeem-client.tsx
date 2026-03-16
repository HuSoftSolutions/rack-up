"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

type Deal = {
  id: string;
  businessId: string | null;
  businessName: string | null;
  title: string | null;
  description: string | null;
  pointCost: number | null;
  terms?: string | null;
  locations: string[];
  locationOptions?: { id: string; name: string }[];
};

export default function DealRedeemCard({ deal }: { deal: Deal }) {
  const router = useRouter();
  const pathname = usePathname();
  const [redeeming, setRedeeming] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{
    expiresAt?: string | null;
    issueId?: string;
    code?: string | null;
  } | null>(null);
  const [redeemed, setRedeemed] = useState(false);
  const { user, loading } = useAuth();
  const [points, setPoints] = useState<number | null>(null);
  const [pointsError, setPointsError] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");

  useEffect(() => {
    setSelectedLocationId("");
  }, [deal.locationOptions]);

  useEffect(() => {
    if (!user) {
      setPoints(null);
      return;
    }

    const currentUser = user;
    let canceled = false;
    async function fetchPoints() {
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch("/api/users/points", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as { points?: number; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to load points.");
        if (!canceled) {
          setPoints(json.points ?? 0);
          setPointsError(null);
        }
      } catch (err) {
        if (!canceled) {
          setPointsError(err instanceof Error ? err.message : "Failed to load points.");
        }
      }
    }
    void fetchPoints();
    return () => {
      canceled = true;
    };
  }, [user]);

  async function onRedeem() {
    if (!user) {
      const redirect = encodeURIComponent(pathname ?? "/rewards");
      router.push(`/signin?redirect=${redirect}`);
      return;
    }
    if (!selectedLocationId) {
      setError("Select a location to redeem this reward.");
      return;
    }
    setRedeeming(true);
    setError(null);
    setResult(null);
    setIssued(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/rewards/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ dealId: deal.id, locationId: selectedLocationId }),
      });
      const json = (await response.json()) as {
        message?: string;
        error?: string;
        pointsRemaining?: number;
        expiresAt?: string | null;
        issueId?: string;
        code?: string;
        locationId?: string;
        locationName?: string;
      };
      if (!response.ok) throw new Error(json.error ?? "Redemption failed.");
      setResult(json.message ?? "Redeemed (stubbed).");
      setIssued({ expiresAt: json.expiresAt, issueId: json.issueId, code: json.code ?? null });
      setRedeemed(true);
      if (typeof json.pointsRemaining === "number") {
        setPoints(json.pointsRemaining);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-12 dark:bg-black">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <Link
          className="inline-flex w-fit items-center gap-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white dark:border-white/10"
          href="/rewards"
        >
          ← Back to rewards
        </Link>

        {/* ── Deal Header Card ── */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 dark:border-white/10 sm:p-8">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
            {deal.businessName ?? deal.businessId ?? "Partner"}
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">{deal.title ?? "Reward"}</h1>
          {deal.description ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{deal.description}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-300">
              {typeof deal.pointCost === "number" ? `${deal.pointCost} pts` : "Points TBD"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-500">
              {deal.locations.join(" · ") || "All locations"}
            </span>
            {user ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400">
                {pointsError
                  ? `Error: ${pointsError}`
                  : points === null
                    ? "Loading points…"
                    : `${points} pts available`}
              </span>
            ) : null}
          </div>

          {deal.locationOptions && deal.locationOptions.length > 0 ? (
            <div className="mt-5 max-w-sm space-y-1.5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
                Redeem at location
              </div>
              <select
                className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 dark:border-white/10 dark:bg-white/5 dark:text-white"
                value={selectedLocationId}
                onChange={(event) => setSelectedLocationId(event.target.value)}
              >
                <option value="" disabled>
                  Select a location
                </option>
                {deal.locationOptions.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {/* ── How it works ── */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 dark:border-white/10">
          <div className="text-sm font-semibold text-zinc-800 dark:text-white">How it works</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-300">1</div>
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Support via RackUp to earn points.</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-300">2</div>
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Redeem here to log a single-use reward.</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-300">3</div>
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Show up in person; staff will confirm and mark it used.</div>
            </div>
          </div>
        </div>

        {/* ── Redeem Action ── */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 dark:border-white/10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-base font-semibold text-zinc-800 dark:text-white">
                Redeem for {deal.pointCost} points
              </div>
              {deal.terms ? (
                <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{deal.terms}</div>
              ) : null}
              {!loading && !user ? (
                <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Sign in to redeem this reward.
                </div>
              ) : null}
            </div>
            <button
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-8 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 transition-all hover:bg-emerald-500 disabled:opacity-50 disabled:shadow-none dark:bg-emerald-500 dark:hover:bg-emerald-400"
              onClick={onRedeem}
              disabled={redeeming || loading || redeemed}
              type="button"
            >
              {redeeming
                ? "Redeeming…"
                : redeemed
                  ? "Redeemed"
                  : !user
                    ? "Sign in required"
                    : "Redeem now"}
            </button>
          </div>

          {result ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
              {result}
            </div>
          ) : null}
          {issued ? (
            <div className="mt-4 space-y-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5">
              <div>
                <div className="text-base font-semibold text-white">Added to your rewards</div>
                <div className="mt-1 text-sm text-zinc-300">
                  Show this code or receipt to a staff member at the location so they can
                  mark it used.
                </div>
              </div>
              {selectedLocationId && deal.locationOptions ? (
                <div className="text-xs text-zinc-400">
                  Redeem at{" "}
                  <span className="font-medium text-zinc-200">
                    {deal.locationOptions.find((loc) => loc.id === selectedLocationId)?.name ??
                      selectedLocationId}
                  </span>
                </div>
              ) : null}
              {issued.code ? (
                <div className="rounded-xl border border-emerald-400/20 bg-black/40 px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Reward code</div>
                  <div className="mt-1.5 font-mono text-2xl font-bold tracking-[0.3em] text-emerald-300">
                    {issued.code}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-zinc-400">
                  {issued.expiresAt
                    ? `Expires ${new Date(issued.expiresAt).toLocaleString()}`
                    : "No expiry"}
                </span>
                {issued.issueId ? (
                  <Link
                    className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-3 py-1 font-medium text-emerald-200 transition hover:bg-white/10"
                    href={`/rewards/receipt/${issued.issueId}`}
                  >
                    View receipt
                  </Link>
                ) : (
                  <Link
                    className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-3 py-1 font-medium text-emerald-200 transition hover:bg-white/10"
                    href="/rewards/history"
                  >
                    View all rewards
                  </Link>
                )}
              </div>
              <div className="text-xs text-zinc-500">
                Want to redeem again?{" "}
                <Link className="text-emerald-300 underline" href="/rewards">
                  Browse rewards
                </Link>
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
