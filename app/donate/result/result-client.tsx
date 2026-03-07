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
  communityDrawingEntries?: number | null;
  communityDrawings?: Array<{
    id: string;
    title: string;
    description?: string;
    entriesAllocated: number;
    prize?: {
      name?: string;
      value?: string;
      imageUrl?: string;
      description?: string;
    } | null;
  }>;
  error?: string;
};

export default function DonateResultClient() {
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(!!sessionId);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
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
  const selectedDrawing =
    status?.communityDrawings?.find((drawing) => drawing.id === selectedDrawingId) ?? null;

  const awardedEntriesTotal =
    typeof status?.communityDrawingEntries === "number"
      ? status.communityDrawingEntries
      : status?.communityDrawings?.reduce(
          (sum, drawing) => sum + (Number.isFinite(drawing.entriesAllocated) ? drawing.entriesAllocated : 0),
          0,
        ) ?? 0;

  useEffect(() => {
    if (!selectedDrawing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedDrawingId(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedDrawing]);

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

        {status?.success ? (
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-200/80">
              Community drawing entries allocated
            </div>
            <div className="mt-2 text-4xl font-semibold text-emerald-300 sm:text-5xl">
              {awardedEntriesTotal}
            </div>
            <div className="mt-1 text-xs text-emerald-100/70">
              Based on your eligible active community drawings and their configured thresholds.
            </div>

            {status.communityDrawings && status.communityDrawings.length > 0 ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {status.communityDrawings.map((drawing) => (
                  <button
                    key={drawing.id}
                    type="button"
                    onClick={() => setSelectedDrawingId(drawing.id)}
                    className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-3 text-left transition hover:border-emerald-200/60 hover:bg-emerald-400/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">
                        {drawing.prize?.name ?? drawing.title}
                      </div>
                      <div className="rounded-full border border-emerald-200/40 bg-emerald-300/10 px-2 py-0.5 text-xs font-semibold text-emerald-100">
                        {drawing.entriesAllocated} entr{drawing.entriesAllocated === 1 ? "y" : "ies"}
                      </div>
                    </div>
                    {drawing.prize?.value ? (
                      <div className="mt-1 text-xs text-emerald-100/80">Estimated value: {drawing.prize.value}</div>
                    ) : null}
                    <div className="mt-1 text-xs text-emerald-200/80">Tap to view details</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-emerald-200/20 bg-emerald-900/20 p-3 text-sm text-emerald-100/85">
                No entries were allocated from this payment yet.
              </div>
            )}
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

      {selectedDrawing ? (
        <div
          className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-4 backdrop-blur-sm sm:items-center sm:py-6"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedDrawingId(null);
          }}
        >
          <div className="my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0d1117] text-white shadow-2xl shadow-black/50">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0d1117] px-4 py-3">
              <div className="text-sm font-semibold text-white">Community Drawing Details</div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/10 hover:text-white"
                onClick={() => setSelectedDrawingId(null)}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto">
              <div className="grid gap-0 md:grid-cols-2">
              <div className="flex items-center justify-center bg-black/30 p-4">
                {selectedDrawing.prize?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedDrawing.prize.imageUrl}
                    alt={selectedDrawing.prize?.name ?? selectedDrawing.title}
                    className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
                  />
                ) : (
                  <div className="flex h-64 w-full items-center justify-center rounded-lg border border-white/10 bg-black/30 text-sm text-zinc-500">
                    Prize image coming soon
                  </div>
                )}
              </div>

              <div className="space-y-3 p-5">
                <div className="text-xs font-medium uppercase tracking-widest text-emerald-300">
                  Active community drawing
                </div>
                <h3 className="text-2xl font-semibold text-white">
                  {selectedDrawing.prize?.name ?? selectedDrawing.title}
                </h3>
                <div className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200 w-fit">
                  {selectedDrawing.entriesAllocated} entr{selectedDrawing.entriesAllocated === 1 ? "y" : "ies"} from this donation
                </div>
                {selectedDrawing.prize?.value ? (
                  <div className="text-sm font-semibold text-emerald-200">
                    Estimated value: {selectedDrawing.prize.value}
                  </div>
                ) : null}
                {selectedDrawing.prize?.description ? (
                  <p className="text-sm leading-relaxed text-zinc-300">{selectedDrawing.prize.description}</p>
                ) : null}
                {selectedDrawing.description ? (
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Details</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                      {selectedDrawing.description}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
