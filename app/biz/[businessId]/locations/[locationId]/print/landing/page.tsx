"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { useReactToPrint } from "react-to-print";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLocationScope } from "../../../../location-scope";

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
  donationUrl?: string;
  logoUrl?: string;
};

type BusinessRow = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
};

type LocationCause = {
  id: string;
  title: string;
  url: string;
  pointsSummary: string;
};

function toTitle(value?: string | null) {
  if (!value) return "N/A";
  return value;
}

function toPointsSummary(cause: CauseRow): string {
  const options = [...(cause.predefinedOptions ?? [])]
    .filter((option) => Number.isFinite(option.amountCents) && Number.isFinite(option.points))
    .sort((a, b) => a.amountCents - b.amountCents);

  if (options.length > 0) {
    return `Options: ${options
      .map((option) => `${(option.amountCents / 100).toFixed(2)} -> ${option.points} pts`)
      .join("; ")}.`;
  }

  const rate = typeof cause.pointsPerDollar === "number" ? cause.pointsPerDollar : null;
  if (rate !== null) {
    const min = typeof cause.minAmountCents === "number" ? `$${(cause.minAmountCents / 100).toFixed(2)}` : null;
    const max = typeof cause.maxAmountCents === "number" ? `$${(cause.maxAmountCents / 100).toFixed(2)}` : null;
    const range = min && max ? ` (${min} - ${max})` : min ? ` (from ${min})` : max ? ` (up to ${max})` : "";
    return `${rate} pts per $1${range}.`;
  }

  return "Points vary by selected amount.";
}

export default function LocationPrintLandingPage({
  params,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
}) {
  const { user } = useAuth();
  const { locationId: scopedLocationId, role } = useLocationScope();
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
    if (role === "staff" && scopedLocationId && scopedLocationId !== locationId) {
      setError("Access denied for this location.");
      setLoading(false);
      return;
    }
    const currentUser = user;
    let canceled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch(
          `/api/business/${businessId}/causes${
            locationId ? `?locationId=${encodeURIComponent(locationId)}` : ""
          }`,
          {
            headers: { Authorization: `Bearer ${idToken}` },
          },
        );
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
              url: match.url,
              pointsSummary: toPointsSummary(cause),
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
    const origin =
      typeof window !== "undefined"
        ? (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin).replace(/\/$/, "")
        : "";
    const path = location.donationUrl ?? `/donate/location/${business.slug}/${location.id}`;
    return `${origin}${path}`;
  }, [business, location]);

  useEffect(() => {
    if (!publicUrl) return;
    const url = publicUrl;
    let canceled = false;
    async function generate() {
      const data = await QRCode.toDataURL(url, { margin: 1, width: 300 });
      if (!canceled) setQrDataUrl(data);
    }
    void generate();
    return () => {
      canceled = true;
    };
  }, [publicUrl]);

  const handlePrint = useReactToPrint({
    contentRef: printableRef,
    documentTitle: business && location ? `${business.slug}-${location.id}-support` : "support",
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
        className="mx-auto flex w-full max-w-[8.27in] flex-col gap-3 bg-white px-6 py-6 print:min-h-[10.8in] print:max-w-none print:gap-2 print:px-4 print:py-4"
        ref={printableRef}
      >
        <header className="flex items-start justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {toTitle(business.name)} support
            </h1>
            <div className="text-sm text-zinc-600">
              {toTitle(location.name)} {location.address ? `· ${location.address}` : ""}
            </div>
          </div>
          <div className="flex gap-2">
            {qrDataUrl ? (
              <a
                href={qrDataUrl}
                download={`${business.slug}-${location.id}-support-qr.png`}
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

        <div className="flex flex-1 flex-col rounded-2xl border border-black/10 bg-white p-4 text-black shadow-sm print:min-h-[10.2in] print:rounded-none print:border-none print:p-2 print:shadow-none break-inside-avoid">
          <div className="flex items-center justify-between gap-3">
            <div className="rounded-xl bg-black p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/RackUp-01.svg" alt="Rack Up" className="h-7 w-auto" />
            </div>
            <div className="flex items-center gap-2">
              {business.logoUrl ? (
                <div className="rounded-xl bg-black p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={business.logoUrl}
                    alt={`${business.name} logo`}
                    className="h-10 w-auto max-w-[140px] object-contain"
                  />
                </div>
              ) : null}
              {location.logoUrl ? (
                <div className="rounded-xl bg-black p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={location.logoUrl}
                    alt={`${location.name ?? location.id} logo`}
                    className="h-10 w-auto max-w-[140px] object-contain"
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 text-xs font-semibold uppercase tracking-wide text-black">
            {toTitle(business.name)} · {toTitle(location.name)}
          </div>
          <div className="mt-1 text-3xl font-semibold leading-tight text-black print:text-[30px]">
            Choose a charity to support
          </div>
          <p className="mt-2 text-sm leading-6 text-black print:text-[13px] print:leading-5">
            Scan this location QR to open the secure support page and choose from all available
            charities at this location.
          </p>

          <div className="mt-3 rounded-2xl border border-black/10 bg-black/[.03] p-3 text-sm text-black print:text-[13px]">
            <div className="font-semibold text-black">Available charities</div>
            {causes.length === 0 ? (
              <div className="mt-1 text-black">No charities are available right now.</div>
            ) : (
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-black">
                {causes.map((cause) => (
                  <li key={cause.id} className="font-semibold">
                    {cause.title}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3 rounded-2xl border border-black/10 bg-black/[.03] p-3 text-sm text-black print:text-[13px]">
            <div className="font-semibold text-black">How to earn points here</div>
            {causes.length === 0 ? (
              <div className="mt-1 text-black">Points details will appear when charities are available.</div>
            ) : (
              <ul className="mt-1.5 space-y-1.5 text-black">
                {causes.map((cause) => (
                  <li key={`points-${cause.id}`}>
                    <span className="font-semibold">{cause.title}: </span>
                    <span>{cause.pointsSummary}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-5 flex flex-1 items-center justify-center">
            {qrDataUrl ? (
              <div className="rounded-2xl border border-black/10 bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR code" className="h-64 w-64 print:h-72 print:w-72" />
              </div>
            ) : (
              <div className="h-64 w-64 rounded-2xl border border-dashed border-black/20 p-4 text-sm text-black/70">
                Generating QR...
              </div>
            )}
          </div>

          <div className="mt-auto rounded-2xl border border-black/10 bg-black/[.03] p-3 text-center text-black">
            <div className="text-base font-semibold">Scan this QR code to choose a charity</div>
            <div className="mt-1 text-sm">
              Open the secure Rack Up page, select a charity, choose an amount, and earn points
              automatically.
            </div>
            <div className="mt-1 text-xs">Tip: Open your camera, scan the code, and follow the prompts.</div>
          </div>
        </div>

        <div className="print:hidden">
          <Link className="text-sm underline" href={`/biz/${business.id}/locations/${location.id}/print`}>
            ← Back to print options
          </Link>
        </div>
      </div>
    </div>
  );
}
