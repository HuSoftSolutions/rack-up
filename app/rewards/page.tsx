"use client";

import clsx from "clsx";
import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/ui-kit/badge";
import { Button } from "@/ui-kit/button";
import { Heading } from "@/ui-kit/heading";
import { Text } from "@/ui-kit/text";
import { useAuth } from "@/lib/auth/AuthProvider";
import GiveawayProgressCard from "@/app/_components/GiveawayProgressCard";

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
        if (!canceled) setError(err instanceof Error ? err.message : "Failed to load rewards.");
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
          setPointsError(err instanceof Error ? err.message : "Failed to load points.");
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Badge color="emerald">Winners Circle</Badge>
          <Heading level={1} className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Redeem RackUp points
          </Heading>
          <Text className="max-w-2xl text-zinc-200">
            Earn points by donating, then redeem at any partner location.
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button href="/rewards/history" outline>
            My rewards
          </Button>
          <Button href="/profile" outline>
            View profile
          </Button>
        </div>
      </header>

      <div className="rounded-3xl border border-white/10 bg-gradient-to-r from-white/10 via-white/5 to-white/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Available rewards</div>
            <div className="text-xs text-zinc-400">
              {loading ? "Loading…" : `${deals.length} available`}
            </div>
          </div>
          <div
            className={clsx(
              "rounded-full border px-3 py-1 text-xs font-semibold",
              pointsStatus.tone === "ready" && "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
              pointsStatus.tone === "error" && "border-red-400/40 bg-red-500/10 text-red-200",
              pointsStatus.tone === "muted" && "border-white/10 bg-white/5 text-zinc-300"
            )}
          >
            {pointsStatus.label}
          </div>
        </div>
      </div>

      <GiveawayProgressCard />

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="h-36 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-zinc-300">
          No rewards are live yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {deals.map((deal) => {
            const hasPoints = typeof points === "number" && typeof deal.pointCost === "number";
            const isLocked = hasPoints && points < (deal.pointCost ?? 0);
            const missingPoints = hasPoints ? Math.max(0, (deal.pointCost ?? 0) - points) : null;
            const cardClass = clsx(
              "group flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 via-white/5 to-transparent p-4 text-left text-white shadow-lg shadow-black/20 transition sm:p-5",
              !isLocked && "hover:-translate-y-1 hover:border-emerald-300/60 hover:shadow-2xl",
              isLocked && "cursor-not-allowed opacity-60 hover:translate-y-0"
            );
            const content = (
              <>
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                      {deal.businessName ?? deal.businessId ?? "Partner"}
                    </div>
                    <div className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                      {typeof deal.pointCost === "number" ? `${deal.pointCost} pts` : "—"}
                    </div>
                  </div>
                  <div className="text-lg font-semibold leading-tight text-white group-hover:text-emerald-200">
                    {deal.title}
                  </div>
                  {deal.description ? (
                    <div className="text-sm text-zinc-300">{deal.description}</div>
                  ) : null}
                  {isLocked && missingPoints !== null ? (
                    <div className="mt-1 inline-flex w-fit rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
                      Need {missingPoints} more pts
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-col gap-1 text-xs text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-zinc-400">
                    {deal.locations.length > 0 ? deal.locations.join(" · ") : "All locations"}
                  </span>
                  {deal.terms ? (
                    <span className="text-zinc-500 sm:text-right">{deal.terms}</span>
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
