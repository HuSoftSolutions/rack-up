"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/ui-kit/badge";
import { Button } from "@/ui-kit/button";
import { Heading } from "@/ui-kit/heading";
import { Text } from "@/ui-kit/text";
import { useRequireAuth } from "@/lib/auth/routeGuards";
import { normalizeClientRequestError } from "@/lib/client/request-error";

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
        if (!canceled) {
          setError(normalizeClientRequestError(err, "Failed to load community drawings."));
        }
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
      {/* ── Header ── */}
      <header className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-3">
            <Badge color="emerald">Community Drawings</Badge>
            <Heading level={1} className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              My community drawings
            </Heading>
            <Text className="max-w-2xl text-zinc-300">
              See every community drawing you&apos;ve been entered into, plus whether each drawing is still active.
            </Text>
          </div>
          <div className="flex flex-wrap gap-2">
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
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-1.5 text-xs font-semibold text-emerald-300">
            {authLoading || loading ? "Loading…" : `${activeCount} active`}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-zinc-400">
            {authLoading || loading ? "Loading…" : `${drawings.length} total drawing${drawings.length !== 1 ? "s" : ""}`}
          </span>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-5 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-44 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
          ))}
        </div>
      ) : drawings.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-zinc-500">
          You don&apos;t have any community drawing entries yet.
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {drawings.map((drawing) => {
            const isActive = drawing.status === "active";
            return (
              <div
                key={drawing.id}
                className={`rounded-2xl border p-5 transition ${
                  isActive
                    ? "border-emerald-400/15 bg-emerald-500/[0.04]"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white">
                      {drawing.prize?.name ?? drawing.title}
                    </div>
                    {drawing.prize?.value ? (
                      <div className="mt-0.5 text-xs text-zinc-500">Est. value: {drawing.prize.value}</div>
                    ) : null}
                  </div>
                  <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(drawing.status)}`}>
                    {statusLabel(drawing.status)}
                  </span>
                </div>

                {drawing.description ? (
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{drawing.description}</p>
                ) : null}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">Your entries</div>
                    <div className="mt-0.5 text-lg font-bold text-emerald-300">{drawing.totalEntries}</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">First entry</div>
                    <div className="mt-0.5 text-xs text-zinc-300">{formatDate(drawing.firstEntryAt)}</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">Last entry</div>
                    <div className="mt-0.5 text-xs text-zinc-300">{formatDate(drawing.lastEntryAt)}</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">Winner drawn</div>
                    <div className="mt-0.5 text-xs text-zinc-300">{formatDate(drawing.winner?.drawnAt ?? null)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
