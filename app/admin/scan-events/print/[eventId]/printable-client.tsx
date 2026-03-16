"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { useReactToPrint } from "react-to-print";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatCadence } from "@/lib/server/scan-events";

type AdminScanEvent = {
  id: string;
  title: string;
  description?: string;
  association: {
    type: "standalone" | "charity" | "business_location" | "custom";
  };
  cadence: { unit: "hours" | "days" | "weeks"; interval: number };
  rewards: {
    points: { enabled: boolean; amount: number };
    giveaway: { enabled: boolean; entries: number; targetMode: "selected" | "all_active"; giveawayIds: string[] };
  };
  imageUrl?: string | null;
  scanPath: string;
};

type LoadResponse = {
  events?: AdminScanEvent[];
  error?: string;
};

function associationLabel(type: AdminScanEvent["association"]["type"]) {
  if (type === "charity") return "Charity event";
  if (type === "business_location") return "Business / location event";
  if (type === "custom") return "Custom event";
  return "Rack Up scan event";
}

export default function PrintableScanEventPoster({ eventId }: { eventId: string }) {
  const { user } = useAuth();
  const printableRef = useRef<HTMLDivElement | null>(null);
  const [event, setEvent] = useState<AdminScanEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [absoluteUrl, setAbsoluteUrl] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/admin/scan-events", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as LoadResponse;
        if (!res.ok) throw new Error(json.error ?? "Failed to load scan events.");
        if (cancelled) return;
        const selected = (json.events ?? []).find((item) => item.id === eventId) ?? null;
        if (!selected) throw new Error("Scan event not found.");
        setEvent(selected);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load scan event.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, user]);

  useEffect(() => {
    if (!event) return;
    const origin =
      typeof window !== "undefined"
        ? (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin).replace(/\/$/, "")
        : "";
    const nextUrl = `${origin}${event.scanPath}`;
    setAbsoluteUrl(nextUrl);
    async function generate() {
      const data = await QRCode.toDataURL(nextUrl, { margin: 1, width: 360 });
      setQrDataUrl(data);
    }
    void generate();
  }, [event]);

  const rewardsLine = useMemo(() => {
    if (!event) return "";
    const pointsPart = event.rewards.points.enabled ? `${event.rewards.points.amount} points` : "No points";
    const giveawayPart = event.rewards.giveaway.enabled
      ? `${event.rewards.giveaway.entries} giveaway entr${event.rewards.giveaway.entries === 1 ? "y" : "ies"}`
      : "No giveaway entries";
    return `${pointsPart} • ${giveawayPart}`;
  }, [event]);

  const handlePrint = useReactToPrint({
    contentRef: printableRef,
    documentTitle: event ? `${event.title.replace(/\s+/g, "-").toLowerCase()}-poster` : "scan-event-poster",
    pageStyle: `
      @page { size: A4 portrait; margin: 0.2in; }
      body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      * { box-sizing: border-box; }
    `,
  });

  if (loading) {
    return <div className="p-6 text-sm text-zinc-300">Loading poster...</div>;
  }

  if (!event) {
    return (
      <div className="space-y-3 p-6 text-sm text-zinc-200">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">{error ?? "Scan event not found."}</div>
        <Link className="underline" href="/admin/scan-events">
          Back to scan events
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-0 py-0 text-black">
      <div ref={printableRef} className="mx-auto flex w-full max-w-2xl flex-col gap-3 bg-white px-6 py-6">
        <header className="flex items-start justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Scan Event Poster</h1>
            <div className="text-sm text-zinc-600">{event.title}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={absoluteUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-black/10 px-3 py-2 text-sm font-medium"
            >
              Open live page
            </a>
            {qrDataUrl ? (
              <a
                href={qrDataUrl}
                download={`${event.title.replace(/\s+/g, "-").toLowerCase()}-qr.png`}
                className="rounded-full border border-black/10 px-3 py-2 text-sm font-medium"
              >
                Download QR PNG
              </a>
            ) : null}
            <button
              type="button"
              className="rounded-full border border-black/10 px-3 py-2 text-sm font-medium"
              onClick={handlePrint}
            >
              Print
            </button>
          </div>
        </header>

        <div className="overflow-hidden rounded-2xl border border-black/10 shadow-sm print:border-none print:shadow-none">
          <div className="grid gap-0 md:grid-cols-2">
            <div className="flex flex-col gap-3 bg-white p-6">
              <div className="text-xs uppercase tracking-wide text-zinc-600">{associationLabel(event.association.type)}</div>
              <div className="text-3xl font-semibold leading-tight">{event.title}</div>
              <p className="text-sm text-zinc-700">
                {event.description?.trim() || "Scan the QR code to claim this Rack Up event."}
              </p>
              {event.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={event.imageUrl} alt={event.title} className="h-44 w-full rounded-2xl border border-black/10 object-cover" />
              ) : null}
              <div className="rounded-2xl bg-black/[.03] p-4 text-sm">
                <div className="font-semibold text-zinc-900">Cadence</div>
                <div className="text-zinc-700">{formatCadence(event.cadence)}</div>
                <div className="mt-2 font-semibold text-zinc-900">Rewards</div>
                <div className="text-zinc-700">{rewardsLine}</div>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 bg-white p-6">
              <div className="w-full rounded-2xl border border-black/10 bg-black/[.03] p-4 text-center">
                <div className="text-sm font-semibold text-zinc-900">Scan to participate</div>
                <div className="mt-1 text-xs text-zinc-600">Opens the event claim page instantly.</div>
              </div>
              {qrDataUrl ? (
                <div className="rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="QR code" className="h-56 w-56 rounded-lg" />
                </div>
              ) : (
                <div className="h-60 w-60 rounded-2xl border border-dashed border-black/20 p-4 text-sm text-zinc-500">
                  Generating QR...
                </div>
              )}
              <div className="max-w-[18rem] text-center text-xs text-zinc-600 break-all">{absoluteUrl}</div>
            </div>
          </div>
        </div>

        <div className="print:hidden">
          <Link className="text-sm underline" href="/admin/scan-events">
            ← Back to scan events
          </Link>
        </div>
      </div>
    </div>
  );
}
