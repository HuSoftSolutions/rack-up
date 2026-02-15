"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { useReactToPrint } from "react-to-print";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLocationScope } from "../../../location-scope";

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
      const data = await QRCode.toDataURL(url, { margin: 1, width: 560 });
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
        className="mx-auto flex w-full max-w-3xl flex-col gap-4 bg-white px-8 py-8"
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

        <div className="overflow-hidden rounded-3xl border border-black/10 shadow-sm print:border-none print:shadow-none">
          <div className="grid gap-0 md:grid-cols-2">
            <div className="flex flex-col gap-4 bg-white p-6">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                {toTitle(business.name)} · {toTitle(location.name)}
              </div>
              <div className="text-3xl font-semibold leading-tight text-black">
                Choose a charity to support
              </div>
              <p className="text-sm text-zinc-800">
                Scan the QR code to pick a cause and support securely. Every support earns Rack Up
                points instantly.
              </p>
              <div className="rounded-2xl border border-black/10 bg-black/[.03] p-4 text-sm">
                <div className="font-semibold text-black">Available causes</div>
                {causes.length === 0 ? (
                  <div className="text-zinc-800">No causes are available right now.</div>
                ) : (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-800">
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
            <div className="flex flex-col items-center justify-center bg-white p-6">
              {qrDataUrl ? (
                <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="QR code" className="h-80 w-80 rounded-2xl" />
                </div>
              ) : (
                <div className="h-80 w-80 rounded-3xl border border-dashed border-black/20 p-4 text-sm text-zinc-500">
                  Generating QR...
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="w-full rounded-3xl bg-zinc-700 px-8 py-4">
          <div className="flex items-center justify-center gap-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/RackUp-01.svg" alt="Rack Up" className="h-14 w-auto" />
            {business.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={business.logoUrl}
                alt={`${business.name} logo`}
                className="h-16 w-auto max-w-[220px] object-contain"
              />
            ) : null}
            {location.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={location.logoUrl}
                alt={`${location.name ?? location.id} logo`}
                className="h-16 w-auto max-w-[220px] object-contain"
              />
            ) : null}
          </div>
        </div>

        <div className="print:hidden">
          <Link className="text-sm underline" href={`/biz/${business.id}/locations`}>
            ← Back to locations
          </Link>
        </div>

      </div>
    </div>
  );
}
