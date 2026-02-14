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
    if (deal.locationOptions && deal.locationOptions.length > 0) {
      setSelectedLocationId(deal.locationOptions[0].id);
    }
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
        <Link className="text-sm underline" href="/rewards">
          ← Back to rewards
        </Link>

        <header className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {deal.businessName ?? deal.businessId ?? "Partner"}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{deal.title ?? "Reward"}</h1>
          {deal.description ? (
            <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">{deal.description}</p>
          ) : null}
          <div className="text-sm text-zinc-700 dark:text-zinc-300">
            <span className="font-semibold">
              {typeof deal.pointCost === "number" ? `${deal.pointCost} points` : "Points TBD"}
            </span>{" "}
            · {deal.locations.join(" · ") || "All locations"}
          </div>
          {deal.locationOptions && deal.locationOptions.length > 0 ? (
            <div className="mt-3 max-w-xs space-y-1 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Redeem at location
              </div>
              <select
                className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-emerald-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
                value={selectedLocationId}
                onChange={(event) => setSelectedLocationId(event.target.value)}
              >
                {deal.locationOptions.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {user ? (
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              {pointsError
                ? `Points: ${pointsError}`
                : points === null
                  ? "Loading points…"
                  : `You have ${points} points.`}
            </div>
          ) : null}
        </header>

        <div className="space-y-3 rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#0e0e0e]">
          <div className="font-medium">How it works</div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
            <li>Donate via RackUp to earn points.</li>
            <li>Redeem here to log a single-use reward to your account.</li>
            <li>Show up in person; staff will confirm and mark it used in their console.</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#0e0e0e]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Redeem for {deal.pointCost} points
              </div>
              {deal.terms ? (
                <div className="text-sm text-zinc-600 dark:text-zinc-400">{deal.terms}</div>
              ) : null}
              {!loading && !user ? (
                <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Sign in to redeem this reward.
                </div>
              ) : null}
            </div>
            <button
              className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
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
            <div className="mt-3 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-200">
              {result}
            </div>
          ) : null}
          {issued ? (
            <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white dark:border-white/10 dark:bg-black/60">
              <div className="font-semibold">Added to your rewards</div>
              <div className="text-sm text-zinc-300">
                Next step: show this code or receipt to a staff member at the location so they can
                mark the reward used and give you the benefit.
              </div>
              {selectedLocationId && deal.locationOptions ? (
                <div className="text-xs text-zinc-400">
                  Redeem at{" "}
                  {deal.locationOptions.find((loc) => loc.id === selectedLocationId)?.name ??
                    selectedLocationId}
                </div>
              ) : null}
              {issued.code ? (
                <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                  <div className="text-xs uppercase tracking-wide text-zinc-400">Reward code</div>
                  <div className="mt-1 font-mono text-lg tracking-[0.3em] text-emerald-200">
                    {issued.code}
                  </div>
                </div>
              ) : null}
              <div className="text-xs text-zinc-400">
                {issued.expiresAt
                  ? `Expires ${new Date(issued.expiresAt).toLocaleString()}`
                  : "No expiry"}
              </div>
              <div className="text-xs">
                {issued.issueId ? (
                  <Link className="underline" href={`/rewards/receipt/${issued.issueId}`}>
                    View receipt
                  </Link>
                ) : (
                  <Link className="underline" href="/rewards/history">
                    View all my rewards
                  </Link>
                )}
              </div>
              <div className="text-xs text-zinc-400">
                Want to redeem again? Go back to{" "}
                <Link className="underline" href="/rewards">
                  rewards
                </Link>{" "}
                and start a new redemption.
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
