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
    if (status?.success) return "Support successful";
    if (statusParam === "cancel") return "Support canceled";
    if (status?.error) return "Support status unavailable";
    return "Processing support";
  }, [status?.error, status?.success, statusParam]);

  const body = useMemo(() => {
    if (status?.success) {
      const amount =
        typeof status.amountTotal === "number"
          ? `$${(status.amountTotal / 100).toFixed(2)}`
          : "your support";
      return `Thank you! We received ${amount}.`;
    }
    if (statusParam === "cancel") {
      return "You canceled before completing payment. No charges were made.";
    }
    if (status?.error) {
      return status.error;
    }
    return "Finalizing your support…";
  }, [status?.amountTotal, status?.error, status?.success, statusParam]);

  const pointsLabel =
    status?.success && typeof status?.points === "number"
      ? `${status.points} pts`
      : status?.success
        ? "Points pending"
        : null;

  const shareText = useMemo(() => {
    if (!status?.success) return "";
    return "Join me in supporting a great cause while earning rewards!";
  }, [status?.success]);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/donate/share`;
  }, []);

  const facebookUrl = shareUrl
    ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
        shareUrl,
      )}&quote=${encodeURIComponent(shareText)}`
    : "";


  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-12 dark:bg-black">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Support status
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
              {status?.success ? (
                <a
                  href={facebookUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-[#1a1a1a]"
                >
                  Share on Facebook
                </a>
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
