"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Timestamp, doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import { useRequireAuth } from "@/lib/auth/routeGuards";
import { normalizeFirestoreListenerError } from "@/lib/client/firestore-error";

type Issue = {
  id: string;
  status: "issued" | "used" | "expired";
  issuedAt?: string | null;
  expiresAt?: string | null;
  usedAt?: string | null;
  title?: string | null;
  businessName?: string | null;
  code?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  redeemLocationName?: string | null;
  usedBy?: { staffId?: string | null; staffName?: string | null; staffEmail?: string | null } | null;
};

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "object" && value !== null && "_seconds" in value) {
    const ts = value as { _seconds: number; _nanoseconds?: number };
    return new Date(ts._seconds * 1000 + Math.floor((ts._nanoseconds ?? 0) / 1_000_000)).toISOString();
  }
  return null;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function StatusPill({ status }: { status: Issue["status"] }) {
  const map: Record<Issue["status"], { label: string; className: string }> = {
    issued: { label: "Active", className: "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30" },
    used: { label: "Used", className: "bg-blue-500/15 text-blue-200 border border-blue-500/30" },
    expired: { label: "Expired", className: "bg-amber-500/15 text-amber-200 border border-amber-500/30" },
  };
  const { label, className } = map[status];
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

export default function RewardReceiptPage() {
  const { issueId } = useParams<{ issueId: string }>();
  const { user, loading } = useRequireAuth(`/signin?redirect=/rewards/receipt/${issueId}`);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !issueId) return;
    const ref = doc(firestore, "reward_issues", issueId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        if (!data) {
          setIssue(null);
          setError("Reward not found.");
          return;
        }
        setError(null);
        setIssue({
          id: snap.id,
          status: (data.status as Issue["status"]) ?? "issued",
          issuedAt: toIso(data.issuedAt),
          expiresAt: toIso(data.expiresAt),
          usedAt: toIso(data.usedAt),
          title: data.displayPayload?.title ?? data.title ?? "Reward",
          businessName: data.displayPayload?.businessName ?? data.businessName ?? data.businessId,
          redeemLocationName: data.redeemLocationName ?? data.displayPayload?.locationName ?? null,
          code: data.code ?? null,
          userName: data.userName ?? null,
          userEmail: data.userEmail ?? data.email ?? null,
          usedBy: data.usedBy ?? null,
        });
      },
      (err) => {
        const normalized = normalizeFirestoreListenerError(err, "Failed to load reward.");
        setError(normalized.userMessage);
      },
    );
    return () => unsubscribe();
  }, [user, issueId]);

  const statusText =
    issue?.status === "used"
      ? `Marked used ${formatDate(issue.usedAt)}`
      : issue?.status === "expired"
        ? `Expired ${formatDate(issue.expiresAt)}`
        : issue?.expiresAt
          ? `Active until ${formatDate(issue.expiresAt)}`
          : "No expiry";

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-[#0b0b0f] px-6 py-12 text-white">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex items-center gap-2">
          <Link
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
            href="/rewards/history"
          >
            ← Back to rewards
          </Link>
          <Link
            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
            href="/profile"
          >
            Profile
          </Link>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl sm:p-8">
          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              {error}
            </div>
          ) : loading || !issue ? (
            <div className="flex items-center gap-3 text-sm text-zinc-400">
              <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-emerald-300" />
              Loading reward…
            </div>
          ) : (
            <div className="space-y-6">
              {/* ── Title + Status ── */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-400">
                    {issue.businessName ?? "Partner"}
                  </div>
                  <div className="mt-1 text-2xl font-bold text-white">{issue.title}</div>
                  <div className="mt-1 text-xs text-zinc-500">Receipt #{issue.id}</div>
                </div>
                <StatusPill status={issue.status} />
              </div>

              {/* ── Reward Code (prominent) ── */}
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] px-5 py-4 text-center">
                <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Reward code</div>
                <div className="mt-2 font-mono text-3xl font-bold tracking-[0.3em] text-emerald-300">
                  {issue.code ?? "—"}
                </div>
              </div>

              {/* ── Status Details ── */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="text-sm font-semibold text-white">Status</h3>
                <p className="mt-1 text-sm text-zinc-300">{statusText}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">Issued</div>
                    <div className="mt-0.5 text-xs text-zinc-300">{formatDate(issue.issuedAt)}</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">Expiry</div>
                    <div className="mt-0.5 text-xs text-zinc-300">{issue.expiresAt ? formatDate(issue.expiresAt) : "No expiry"}</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">Location</div>
                    <div className="mt-0.5 text-xs text-zinc-300">{issue.redeemLocationName ?? "—"}</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">Used by</div>
                    <div className="mt-0.5 text-xs text-zinc-300">{issue.usedBy?.staffName ?? issue.usedBy?.staffId ?? "—"}</div>
                  </div>
                </div>
              </div>

              {/* ── For Staff ── */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="text-sm font-semibold text-white">For staff</h3>
                <p className="mt-1 text-sm text-zinc-400">
                  Confirm this screen with the customer and mark it used in the business console.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">Customer</div>
                    <div className="mt-0.5 text-xs text-zinc-300">{issue.userName ?? "—"}</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">Email</div>
                    <div className="mt-0.5 text-xs text-zinc-300">{issue.userEmail ?? "—"}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
