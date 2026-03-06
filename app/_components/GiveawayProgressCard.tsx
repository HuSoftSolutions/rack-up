"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

type GiveawayProgress = {
  activeGiveawayCount: number;
  entryUnitPoints: number;
  pointsToNextEntry: number;
  carryPoints: number;
};

export default function GiveawayProgressCard({
  className = "",
  estimatedPoints,
}: {
  className?: string;
  estimatedPoints?: number;
}) {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<GiveawayProgress | null>(null);

  useEffect(() => {
    if (!user) {
      setProgress(null);
      setError(null);
      return;
    }
    const currentUser = user;
    let canceled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch("/api/users/giveaway-progress", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as GiveawayProgress & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to load giveaway progress.");
        if (!canceled) setProgress(json);
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : "Failed to load giveaway progress.");
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [user]);

  const projected = useMemo(() => {
    if (!progress || typeof estimatedPoints !== "number" || estimatedPoints <= 0) return null;
    const entryUnit = progress.entryUnitPoints || 500;
    const currentCarry = Math.max(0, progress.carryPoints || 0) % entryUnit;
    const total = currentCarry + Math.floor(estimatedPoints);
    const entriesGained = Math.floor(total / entryUnit);
    const carryOut = total % entryUnit;
    const pointsToNext = carryOut === 0 ? entryUnit : entryUnit - carryOut;
    return { entriesGained, pointsToNext };
  }, [estimatedPoints, progress]);

  if (!authLoading && !user) {
    return (
      <div className={`rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-zinc-300 ${className}`}>
        Sign in to track giveaway progress. Entry thresholds vary by giveaway.
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-zinc-400 ${className}`}>
        Loading giveaway progress...
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200 ${className}`}>
        {error}
      </div>
    );
  }

  const entryUnit = progress?.entryUnitPoints ?? 500;
  const pointsToNextEntry = progress?.pointsToNextEntry ?? 500;
  const carryPoints = progress?.carryPoints ?? 0;

  return (
    <div className={`rounded-xl border border-emerald-300/20 bg-emerald-500/[0.08] p-3 ${className}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
        Giveaway progress
      </div>
      <div className="mt-1 text-sm text-emerald-50">
        <span className="font-semibold">{pointsToNextEntry}</span> points until your next giveaway entry.
      </div>
      <div className="mt-1 text-xs text-emerald-100/90">
        Carryover: {carryPoints}/{entryUnit} points. Every {entryUnit} points earned = 1 entry
        in each eligible active giveaway.
      </div>
      {projected ? (
        <div className="mt-1 text-xs text-emerald-100/90">
          This donation projects {projected.entriesGained} new entr{projected.entriesGained === 1 ? "y" : "ies"}; then {projected.pointsToNext} points to the following entry.
        </div>
      ) : null}
      <div className="mt-1 text-xs text-emerald-100/80">
        Drawings happen monthly. Entries are added automatically.
      </div>
    </div>
  );
}
