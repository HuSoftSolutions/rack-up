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
        if (!res.ok) throw new Error(json.error ?? "Failed to load community drawing progress.");
        if (!canceled) setProgress(json);
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : "Failed to load community drawing progress.");
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
        Sign in to track community drawing progress. Entry thresholds vary by community drawing.
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-zinc-400 ${className}`}>
        Loading community drawing progress...
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
  const progressPct = entryUnit > 0 ? Math.min(100, ((entryUnit - pointsToNextEntry) / entryUnit) * 100) : 0;

  return (
    <div className={`rounded-2xl border border-emerald-300/20 bg-emerald-500/[0.08] p-5 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
          Community drawing progress
        </div>
        <div className="text-xs text-emerald-200/70">
          Every {entryUnit} pts = 1 entry
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-end justify-between text-sm">
          <span className="text-emerald-100">
            <span className="text-lg font-bold text-emerald-300">{pointsToNextEntry}</span> pts to next entry
          </span>
          <span className="text-xs text-emerald-200/60">{Math.round(progressPct)}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-900/40">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-1.5 text-xs text-emerald-200/60">
          {carryPoints} / {entryUnit} carryover points
        </div>
      </div>

      {projected ? (
        <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          This donation adds {projected.entriesGained} entr{projected.entriesGained === 1 ? "y" : "ies"}, then {projected.pointsToNext} pts to the next.
        </div>
      ) : null}
      <div className="mt-2 text-[11px] text-emerald-200/50">
        Drawings happen monthly. Entries are added automatically.
      </div>
    </div>
  );
}
