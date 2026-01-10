"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import confetti from "canvas-confetti";
import React, { useEffect, useMemo, useRef, useState } from "react";

type StatusResponse = {
  status?: string;
  paymentStatus?: string;
  amountTotal?: number | null;
  currency?: string | null;
  success?: boolean;
  charityId?: string | null;
  businessId?: string | null;
  causeId?: string | null;
  causeTitle?: string | null;
  businessName?: string | null;
  points?: number | null;
  locationId?: string | null;
  locationSlug?: string | null;
  receiptUrl?: string | null;
  error?: string;
};

export default function DonateResultClient() {
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(!!sessionId);
  const confettiFired = useRef(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!sessionId) return;
    let canceled = false;
    async function load() {
      try {
        const res = await fetch(`/api/stripe/checkout-status?session_id=${sessionId}`);
        const json = (await res.json()) as StatusResponse;
        if (!canceled) setStatus(json);
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!status?.success || confettiFired.current) return;
    if (typeof window === "undefined") return;
    confettiFired.current = true;
    const colors = ["#34d399", "#10b981", "#6ee7b7", "#a7f3d0"];
    const shoot = (originX: number) =>
      confetti({
        particleCount: 90,
        spread: 70,
        startVelocity: 36,
        gravity: 0.9,
        decay: 0.92,
        origin: { x: originX, y: 0.2 },
        colors,
      });
    shoot(0.2);
    shoot(0.8);
    const timeout = window.setTimeout(() => {
      shoot(0.5);
    }, 280);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [status?.success]);

  const heading = useMemo(() => {
    if (status?.success) return "Donation successful";
    if (statusParam === "cancel") return "Donation canceled";
    if (status?.error) return "Donation status unavailable";
    return "Processing donation";
  }, [status?.error, status?.success, statusParam]);

  const body = useMemo(() => {
    if (status?.success) {
      const amount =
        typeof status.amountTotal === "number"
          ? `$${(status.amountTotal / 100).toFixed(2)}`
          : "your donation";
      return `Thank you! We received ${amount}.`;
    }
    if (statusParam === "cancel") {
      return "You canceled before completing payment. No charges were made.";
    }
    if (status?.error) {
      return status.error;
    }
    return "Finalizing your donation…";
  }, [status?.amountTotal, status?.error, status?.success, statusParam]);

  const pointsLabel =
    status?.success && typeof status?.points === "number"
      ? `${status.points} pts`
      : status?.success
        ? "Points pending"
        : null;

  async function shareStatus() {
    if (!status?.success) return;
    const amount =
      typeof status.amountTotal === "number"
        ? `$${(status.amountTotal / 100).toFixed(2)}`
        : "a donation";
    const cause = status.causeTitle ?? status.causeId ?? "";
    const biz = status.businessName ?? status.businessId ?? "";
    const target =
      cause && biz ? `${cause} at ${biz}` : cause || biz ? `${cause || biz}` : "";
    const text = `I just donated ${amount} via RackUp${
      target ? ` to ${target}` : ""
    }!`;
    const url = typeof window !== "undefined" ? window.location.origin : undefined;
    if (navigator.share) {
      await navigator.share({ title: "RackUp donation", text, url });
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-12 dark:bg-black">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Donation status
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{heading}</h1>
          <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">{body}</p>
        </header>

        {pointsLabel ? (
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-200/80">
              Points earned
            </div>
            <div className="mt-2 text-4xl font-semibold text-emerald-300 sm:text-5xl">
              {pointsLabel}
            </div>
            <div className="mt-1 text-xs text-emerald-100/70">
              Added to your RackUp account.
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-black/10 bg-white p-5 text-sm text-zinc-700 dark:border-white/10 dark:bg-[#0e0e0e] dark:text-zinc-200">
          <div className="flex flex-col gap-2">
            <div className="font-medium">Details</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="text-zinc-600 dark:text-zinc-400">Status</div>
              <div className="font-medium">
                {loading
                  ? "Loading…"
                  : status?.success
                    ? "Paid"
                    : statusParam === "cancel"
                      ? "Canceled"
                      : status?.paymentStatus ?? "Unknown"}
              </div>
              <div className="text-zinc-600 dark:text-zinc-400">Amount</div>
              <div className="font-medium">
                {typeof status?.amountTotal === "number"
                  ? `$${(status.amountTotal / 100).toFixed(2)}`
                  : loading
                    ? "Loading…"
                    : "—"}
              </div>
              <div className="text-zinc-600 dark:text-zinc-400">Cause</div>
              <div className="font-medium">
                {status?.causeTitle ??
                  status?.causeId ??
                  status?.charityId ??
                  "—"}
              </div>
              <div className="text-zinc-600 dark:text-zinc-400">Business</div>
              <div className="font-medium">
                {status?.businessName ?? status?.businessId ?? "—"}
              </div>
              <div className="text-zinc-600 dark:text-zinc-400">Location</div>
              <div className="font-medium">
                {status?.locationSlug ?? status?.locationId ?? "—"}
              </div>
              <div className="text-zinc-600 dark:text-zinc-400">Points earned</div>
              <div className="font-medium">
                {typeof status?.points === "number"
                  ? `${status.points} pts`
                  : loading
                    ? "Loading…"
                    : "—"}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-3">
              {status?.receiptUrl ? (
                <a
                  href={status.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-[#1a1a1a]"
                >
                  Download receipt
                </a>
              ) : null}
              {status?.success && canShare ? (
                <button
                  type="button"
                  onClick={shareStatus}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-[#1a1a1a]"
                >
                  Share donation
                </button>
              ) : null}
              <Link
                className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
                href="/rewards"
              >
                Go to rewards
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
