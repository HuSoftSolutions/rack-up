"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/ui-kit/badge";
import { Button } from "@/ui-kit/button";
import { Heading } from "@/ui-kit/heading";
import { Text } from "@/ui-kit/text";
import { useRequireAuth } from "@/lib/auth/routeGuards";

type Drawing = {
  id: string;
  title: string;
  status: "draft" | "active" | "closed" | "drawn";
  description: string;
  totalEntries: number;
  firstEntryAt: string | null;
  lastEntryAt: string | null;
  prize?: {
    name?: string;
    value?: string;
    imageUrl?: string;
    description?: string;
  } | null;
  winner?: {
    drawnAt?: string | null;
    donorName?: string | null;
    donorEmail?: string | null;
  } | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function statusLabel(status: Drawing["status"]) {
  if (status === "active") return "Active";
  if (status === "closed") return "Closed";
  if (status === "drawn") return "Drawn";
  return "Draft";
}

function statusClasses(status: Drawing["status"]) {
  if (status === "active") return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  if (status === "closed") return "border-amber-400/40 bg-amber-500/10 text-amber-200";
  if (status === "drawn") return "border-blue-400/40 bg-blue-500/10 text-blue-200";
  return "border-zinc-400/30 bg-zinc-500/10 text-zinc-200";
}

export default function MyCommunityDrawingsPage() {
  const { user, loading: authLoading } = useRequireAuth("/signin?redirect=/rewards/giveaways");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const currentUser = user;
    let canceled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch("/api/users/community-drawings", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as { drawings?: Drawing[]; error?: string };
        if (!res.ok || !json.drawings) {
          throw new Error(json.error ?? "Failed to load community drawings.");
        }
        if (!canceled) setDrawings(json.drawings);
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : "Failed to load community drawings.");
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    void load();
    return () => {
      canceled = true;
    };
  }, [user]);

  const activeCount = useMemo(
    () => drawings.filter((drawing) => drawing.status === "active").length,
    [drawings],
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Badge color="emerald">Community Drawings</Badge>
          <Heading level={1} className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            My community drawings
          </Heading>
          <Text className="max-w-2xl text-zinc-200">
            See every community drawing you&apos;ve been entered into, plus whether each drawing is still active.
          </Text>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button href="/rewards" outline>
            Browse rewards
          </Button>
          <Button href="/rewards/history" outline>
            My rewards
          </Button>
          <Button href="/profile" color="emerald">
            Profile
          </Button>
        </div>
      </header>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-white">Your community drawing history</div>
          <div className="text-xs text-zinc-400">
            {authLoading || loading
              ? "Loading…"
              : `${drawings.length} total · ${activeCount} active`}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-36 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
          ))}
        </div>
      ) : drawings.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-zinc-300">
          You don&apos;t have any community drawing entries yet.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {drawings.map((drawing) => (
            <div key={drawing.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-white">
                    {drawing.prize?.name ?? drawing.title}
                  </div>
                  {drawing.prize?.value ? (
                    <div className="text-xs text-zinc-400">Estimated value: {drawing.prize.value}</div>
                  ) : null}
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(drawing.status)}`}>
                  {statusLabel(drawing.status)}
                </span>
              </div>

              {drawing.description ? (
                <p className="mt-2 text-sm text-zinc-300">{drawing.description}</p>
              ) : null}

              <div className="mt-3 grid gap-2 text-xs text-zinc-300 sm:grid-cols-2">
                <div>
                  <span className="text-zinc-500">Total entries:</span>{" "}
                  <span className="font-semibold text-white">{drawing.totalEntries}</span>
                </div>
                <div>
                  <span className="text-zinc-500">First entry:</span>{" "}
                  <span>{formatDate(drawing.firstEntryAt)}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Last entry:</span>{" "}
                  <span>{formatDate(drawing.lastEntryAt)}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Winner drawn:</span>{" "}
                  <span>{formatDate(drawing.winner?.drawnAt ?? null)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
