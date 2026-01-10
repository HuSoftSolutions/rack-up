"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { useReactToPrint } from "react-to-print";
import { useAuth } from "@/lib/auth/AuthProvider";

type CauseRow = {
  id: string;
  title?: string;
  description?: string;
  mode?: string;
  pointsPerDollar?: number;
  minAmountCents?: number;
  maxAmountCents?: number;
  predefinedOptions?: { amountCents: number; points: number; label?: string }[];
  urls?: { locationId: string; locationName: string; url: string }[];
};

type LocationRow = {
  id: string;
  name?: string;
  slug?: string;
  address?: string;
};

type BusinessRow = {
  id: string;
  name: string;
  slug: string;
};

type LocationCause = {
  id: string;
  title: string;
  description?: string;
  url: string;
};

function toTitle(value?: string | null) {
  if (!value) return "N/A";
  return value;
}

export default function LocationPrintPage({
  params,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
}) {
  const { user } = useAuth();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [business, setBusiness] = useState<BusinessRow | null>(null);
  const [location, setLocation] = useState<LocationRow | null>(null);
  const [causes, setCauses] = useState<LocationCause[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const printableRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    params.then((p) => {
      setBusinessId(p.businessId);
      setLocationId(p.locationId);
    });
  }, [params]);

  useEffect(() => {
    if (!user || !businessId || !locationId) return;
    const currentUser = user;
    let canceled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch(`/api/business/${businessId}/causes`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as {
          business?: BusinessRow;
          locations?: LocationRow[];
          causes?: CauseRow[];
          error?: string;
        };
        if (!res.ok || !json.business || !json.locations || !json.causes) {
          throw new Error(json.error ?? "Failed to load causes.");
        }
        const foundLocation = json.locations.find((loc) => loc.id === locationId);
        if (!foundLocation) {
          throw new Error("Location not found for this business.");
        }
        const locationCauses = json.causes
          .map((cause) => {
            const match = cause.urls?.find((url) => url.locationId === locationId);
            if (!match) return null;
            return {
              id: cause.id,
              title: cause.title ?? cause.id,
              description: cause.description ?? undefined,
              url: match.url,
            };
          })
          .filter(Boolean) as LocationCause[];

        if (!canceled) {
          setBusiness(json.business);
          setLocation(foundLocation);
          setCauses(locationCauses);
        }
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : "Failed to load location.");
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [businessId, locationId, user]);

  const publicUrl = useMemo(() => {
    if (!business || !location) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/donate/location/${business.slug}/${location.id}`;
  }, [business, location]);

  useEffect(() => {
    if (!publicUrl) return;
    const url = publicUrl;
    let canceled = false;
    async function generate() {
      const data = await QRCode.toDataURL(url, { margin: 1, width: 280 });
      if (!canceled) setQrDataUrl(data);
    }
    void generate();
    return () => {
      canceled = true;
    };
  }, [publicUrl]);

  const handlePrint = useReactToPrint({
    contentRef: printableRef,
    documentTitle: business && location ? `${business.slug}-${location.id}-donations` : "donations",
    pageStyle: `
      @page { size: A4 portrait; margin: 0.2in; }
      body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      * { box-sizing: border-box; }
    `,
  });

  if (loading) {
    return <div className="p-6 text-sm text-zinc-400">Loading print sheet...</div>;
  }

  if (error || !business || !location) {
    return (
      <div className="p-6 text-sm text-red-200">
        {error ?? "Unable to load location details."}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-0 py-0 text-black">
      <div
        id="print-sheet"
        className="mx-auto flex w-full max-w-2xl flex-col gap-3 bg-white px-6 py-6"
        ref={printableRef}
      >
        <header className="flex items-start justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {toTitle(business.name)} donations
            </h1>
            <div className="text-sm text-zinc-600">
              {toTitle(location.name)} {location.address ? `· ${location.address}` : ""}
            </div>
          </div>
          <div className="flex gap-2">
            {qrDataUrl ? (
              <a
                href={qrDataUrl}
                download={`${business.slug}-${location.id}-donations-qr.png`}
                className="rounded-full border border-black/10 px-3 py-2 text-sm font-medium"
              >
                Download PNG
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
              <div className="text-xs uppercase tracking-wide text-zinc-600">
                {toTitle(business.name)} · {toTitle(location.name)}
              </div>
              <div className="text-3xl font-semibold leading-tight">Choose a charity to support</div>
              <p className="text-sm text-zinc-700">
                Scan the QR code to pick a cause and donate securely. Every donation earns Rack Up
                points instantly.
              </p>
              <div className="rounded-2xl bg-black/[.03] p-4 text-sm">
                <div className="font-semibold text-zinc-900">Available causes</div>
                {causes.length === 0 ? (
                  <div className="text-zinc-700">No causes are available right now.</div>
                ) : (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-700">
                    {causes.map((cause) => (
                      <li key={cause.id}>
                        <span className="font-semibold">{cause.title}</span>
                        {cause.description ? ` — ${cause.description}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 bg-white p-6">
              <div className="w-full rounded-2xl border border-black/10 bg-black/[.03] p-4 text-center">
                <div className="text-sm font-semibold text-zinc-900">Scan to donate here</div>
                <div className="mt-1 text-xs text-zinc-600">
                  Choose a charity, select an amount, and complete the secure checkout.
                </div>
              </div>
              {qrDataUrl ? (
                <div className="rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="QR code" className="h-48 w-48 rounded-lg" />
                </div>
              ) : (
                <div className="h-52 w-52 rounded-2xl border border-dashed border-black/20 p-4 text-sm text-zinc-500">
                  Generating QR...
                </div>
              )}
              <div className="text-xs text-zinc-600">
                Tip: Open your camera, scan the code, and follow the prompts.
              </div>
            </div>
          </div>
        </div>

        <div className="print:hidden">
          <Link className="text-sm underline" href={`/biz/${business.id}/causes`}>
            ← Back to causes
          </Link>
        </div>

        <div className="mt-4 rounded-2xl bg-black/[.03] p-4 text-xs text-zinc-600 print:mt-2 print:text-[11px]">
          <div className="font-semibold text-zinc-900">How Rack Up works</div>
          <div className="mt-1">
            Scan the QR code to choose a charity, donate, and earn points automatically. Points can
            be redeemed at any partner location.
          </div>
        </div>
      </div>
    </div>
  );
}
