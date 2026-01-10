"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

export default function PointsBanner() {
  const { user, loading } = useAuth();
  const [points, setPoints] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          setError(null);
        }
      } catch (err) {
        if (!canceled) {
          setError(err instanceof Error ? err.message : "Failed to load points.");
        }
      }
    }
    void fetchPoints();
    return () => {
      canceled = true;
    };
  }, [user]);

  if (!loading && !user) {
    return (
      <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-zinc-700 dark:border-white/10 dark:bg-[#0e0e0e] dark:text-zinc-200">
        <div className="flex items-center justify-between gap-3">
          <div>Sign in to see your points and redeem rewards.</div>
          <Link className="underline" href="/signin">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-zinc-700 dark:border-white/10 dark:bg-[#0e0e0e] dark:text-zinc-200">
      {error
        ? `Points: ${error}`
        : points === null
          ? "Loading points…"
          : `You have ${points} points to redeem.`}
    </div>
  );
}
