"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Timestamp, doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import { useRequireAuth } from "@/lib/auth/routeGuards";

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
        setError(err.message);
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
        <div className="flex items-center justify-between">
          <Link className="text-sm underline" href="/rewards/history">
            ← Back to rewards
          </Link>
          <Link className="text-sm underline" href="/profile">
            Profile
          </Link>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl">
          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : loading || !issue ? (
            <div className="text-sm text-zinc-300">Loading reward…</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-emerald-200">
                    {issue.businessName ?? "Partner"}
                  </div>
                  <div className="text-2xl font-semibold text-white">{issue.title}</div>
                  <div className="text-xs text-zinc-400">Receipt #{issue.id}</div>
                </div>
                <StatusPill status={issue.status} />
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <div className="text-sm font-semibold text-white">Status</div>
                <div className="text-sm text-zinc-300">{statusText}</div>
                <div className="mt-2 grid gap-3 text-xs text-zinc-400 sm:grid-cols-2">
                  <div>Issued: {formatDate(issue.issuedAt)}</div>
                  <div>{issue.expiresAt ? `Expires: ${formatDate(issue.expiresAt)}` : "No expiry"}</div>
                  <div>Location: {issue.redeemLocationName ?? "—"}</div>
                  <div>Used by: {issue.usedBy?.staffName ?? issue.usedBy?.staffId ?? "—"}</div>
                  <div>Verifier email: {issue.usedBy?.staffEmail ?? "—"}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <div className="text-sm font-semibold text-white">For staff</div>
                <div className="mt-1 text-sm text-zinc-300">
                  Confirm this screen with the customer and mark it used in the business console.
                </div>
                <div className="mt-3 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
                  <div>Customer: {issue.userName ?? "—"}</div>
                  <div>Email: {issue.userEmail ?? "—"}</div>
                </div>
                <div className="mt-4 rounded-xl border border-white/10 bg-black/50 px-3 py-2">
                  <div className="text-xs uppercase tracking-wide text-zinc-400">Reward code</div>
                  <div className="mt-1 font-mono text-lg tracking-[0.3em] text-emerald-200">
                    {issue.code ?? "—"}
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-zinc-500">Receipt ID: {issue.id}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
