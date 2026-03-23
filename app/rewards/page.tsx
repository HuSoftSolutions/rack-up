"use client";

import clsx from "clsx";
import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/ui-kit/badge";
import { Button } from "@/ui-kit/button";
import { Heading } from "@/ui-kit/heading";
import { Text } from "@/ui-kit/text";
import { useAuth } from "@/lib/auth/AuthProvider";
import { normalizeClientRequestError } from "@/lib/client/request-error";

type Deal = {
  id: string;
  businessId: string | null;
  businessName: string | null;
  title: string | null;
  description: string | null;
  type: string | null;
  terms: string | null;
  pointCost: number | null;
  locations: string[];
};

export const dynamic = "force-dynamic";

export default function RewardsPage() {
  const { user, loading: authLoading } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointsError, setPointsError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/rewards/deals", { cache: "no-store" });
        const json = (await res.json()) as { deals?: Deal[]; error?: string };
        if (!res.ok || !json.deals) throw new Error(json.error ?? "Failed to load rewards.");
        if (!canceled) setDeals(json.deals.filter((d) => d.title));
      } catch (err) {
        if (!canceled) setError(normalizeClientRequestError(err, "Failed to load rewards."));
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setPoints(null);
      setPointsError(null);
      return;
    }
    const currentUser = user;
    let canceled = false;
    async function loadPoints() {
      setPointsLoading(true);
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
          setPointsError(normalizeClientRequestError(err, "Failed to load points."));
        }
      } finally {
        if (!canceled) setPointsLoading(false);
      }
    }
    void loadPoints();
    return () => {
      canceled = true;
    };
  }, [user]);

  const pointsStatus = useMemo(() => {
    if (!authLoading && !user) return { label: "Sign in to see your points.", tone: "muted" };
    if (pointsError) return { label: pointsError, tone: "error" };
    if (pointsLoading) return { label: "Loading your points…", tone: "muted" };
    if (typeof points === "number") return { label: `${points} points`, tone: "ready" };
    return { label: "Loading your points…", tone: "muted" };
  }, [authLoading, points, pointsError, pointsLoading, user]);

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <header className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-3">
            <Badge color="emerald">Winners Circle</Badge>
            <Heading level={1} className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Redeem RackUp points
            </Heading>
            <Text className="max-w-2xl text-zinc-300">
              Earn points by supporting causes, then redeem at any partner location.
            </Text>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button href="/rewards/history" outline>
              My rewards
            </Button>
            <Button href="/rewards/giveaways" outline>
              Community Drawings
            </Button>
            <Button href="/profile" outline>
              Profile
            </Button>
          </div>
        </div>

        {/* Points + count bar */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div
            className={clsx(
              "rounded-full border px-4 py-1.5 text-xs font-semibold",
              pointsStatus.tone === "ready" && "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
              pointsStatus.tone === "error" && "border-red-400/30 bg-red-500/10 text-red-200",
              pointsStatus.tone === "muted" && "border-white/10 bg-white/5 text-zinc-400"
            )}
          >
            {pointsStatus.label}
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-zinc-400">
            {loading ? "Loading…" : `${deals.length} reward${deals.length !== 1 ? "s" : ""} available`}
          </span>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="h-44 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-zinc-400">
          No rewards are live yet. Check back soon.
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {deals.map((deal) => {
            const hasPoints = typeof points === "number" && typeof deal.pointCost === "number";
            const isLocked = hasPoints && points < (deal.pointCost ?? 0);
            const missingPoints = hasPoints ? Math.max(0, (deal.pointCost ?? 0) - points) : null;
            const cardClass = clsx(
              "group flex h-full flex-col justify-between rounded-2xl border p-5 text-left text-white transition sm:p-6",
              !isLocked && "border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] hover:-translate-y-1 hover:border-emerald-400/40 hover:shadow-xl hover:shadow-emerald-900/10",
              isLocked && "cursor-not-allowed border-white/5 bg-white/[0.02] opacity-50"
            );
            const content = (
              <>
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                      {deal.businessName ?? deal.businessId ?? "Partner"}
                    </div>
                    <div className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
                      {typeof deal.pointCost === "number" ? `${deal.pointCost} pts` : "—"}
                    </div>
                  </div>
                  <div className="text-lg font-semibold leading-snug text-white group-hover:text-emerald-200">
                    {deal.title}
                  </div>
                  {deal.description ? (
                    <div className="text-sm leading-relaxed text-zinc-400">{deal.description}</div>
                  ) : null}
                  {isLocked && missingPoints !== null ? (
                    <div className="inline-flex w-fit rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300">
                      Need {missingPoints} more pts
                    </div>
                  ) : null}
                </div>
                <div className="mt-5 flex flex-col gap-1 border-t border-white/5 pt-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-zinc-500">
                    {deal.locations.length > 0 ? deal.locations.join(" · ") : "All locations"}
                  </span>
                  {deal.terms ? (
                    <span className="text-zinc-600 sm:text-right">{deal.terms}</span>
                  ) : null}
                </div>
              </>
            );

            return isLocked ? (
              <Button key={deal.id} className={cardClass} plain disabled>
                {content}
              </Button>
            ) : (
              <Button
                key={deal.id}
                href={`/rewards/${deal.id}`}
                className={cardClass}
                plain
              >
                {content}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
