"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { BusinessDoc, CauseDoc, LocationDoc } from "@/lib/types/business";
import { useReactToPrint } from "react-to-print";

type Config = {
  business: BusinessDoc & { id: string };
  cause: CauseDoc & { id: string };
  location: LocationDoc & { id: string };
  qrToken: string;
};

export default function PrintableQr({ config }: { config: Config }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const printableRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/donate/${config.business.slug}/${config.cause.slug}/${config.location.slug}?qr=${encodeURIComponent(
      config.qrToken,
    )}`;
    async function generate() {
      const data = await QRCode.toDataURL(url, { margin: 1, width: 280 });
      setQrDataUrl(data);
    }
    void generate();
  }, [config.business.slug, config.cause.slug, config.location.slug, config.qrToken]);

  const pointsText =
    config.cause.mode === "predefined"
      ? (() => {
          const opts = config.cause.predefinedOptions ?? [];
          return `Choose a preset amount to donate and earn Rack Up points instantly. Options: ${opts
            .map((opt) => `${(opt.amountCents / 100).toFixed(2)} → ${opt.points} pts`)
            .join("; ")}.`;
        })()
      : (() => {
          const min = config.cause.minAmountCents
            ? `$${(config.cause.minAmountCents / 100).toFixed(2)}`
            : null;
          const max = config.cause.maxAmountCents
            ? `$${(config.cause.maxAmountCents / 100).toFixed(2)}`
            : null;
          const range =
            min && max ? `${min}–${max}` : min ? `from ${min}` : max ? `up to ${max}` : "";
          return `Donate any amount${range ? ` (${range})` : ""} and earn ${
            config.cause.pointsPerDollar ?? 100
          } Rack Up points per $1. Your points are added automatically after checkout.`;
        })();

  const handlePrint = useReactToPrint({
    contentRef: printableRef,
    documentTitle: `${config.business.slug}-${config.location.slug}-${config.cause.slug}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 0.2in; }
      body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      * { box-sizing: border-box; }
    `,
  });

  return (
    <div className="min-h-screen bg-white px-0 py-0 text-black">
      <div
        id="print-sheet"
        className="mx-auto flex w-full max-w-2xl flex-col gap-3 bg-white px-6 py-6"
        ref={printableRef}
      >
        <header className="flex items-start justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{config.cause.title}</h1>
            <div className="text-sm text-zinc-600">
              {config.business.name} · {config.location.name}
            </div>
          </div>
          <div className="flex gap-2">
            {qrDataUrl ? (
              <a
                href={qrDataUrl}
                download={`${config.business.slug}-${config.location.slug}-${config.cause.slug}-qr.png`}
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

        <div className="overflow-hidden rounded-2xl border border-black/10 shadow-sm print:border-none print:shadow-none break-inside-avoid">
          <div className="grid gap-0 md:grid-cols-2">
            <div className="flex flex-col gap-3 bg-white p-6 break-inside-avoid">
              <div className="flex items-center justify-between gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/RackUp-01.svg" alt="Rack Up" className="h-7 w-auto" />
                {config.business.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={config.business.logoUrl}
                    alt={`${config.business.name} logo`}
                    className="h-10 w-auto max-w-[140px] object-contain"
                  />
                ) : null}
              </div>
              <div className="text-xs uppercase tracking-wide text-zinc-600">
                {config.business.name} · {config.location.name}
              </div>
              <div className="text-3xl font-semibold leading-tight">{config.cause.title}</div>
              {config.cause.description ? (
                <p className="text-sm text-zinc-700">{config.cause.description}</p>
              ) : null}
              <div className="rounded-2xl bg-black/[.03] p-4 text-sm">
                <div className="font-semibold text-zinc-900">How to earn points here</div>
                <div className="text-zinc-700">{pointsText}</div>
              </div>
              {config.cause.imageUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={config.cause.imageUrl}
                    alt="Cause header"
                    className="mt-2 w-full max-h-52 rounded-2xl object-contain"
                  />
                </>
              ) : null}
            </div>
            <div className="flex flex-col items-center justify-center gap-3 bg-white p-6">
              <div className="w-full rounded-2xl border border-black/10 bg-black/[.03] p-4 text-center">
                <div className="text-sm font-semibold text-zinc-900">Scan to support this cause</div>
                <div className="mt-1 text-xs text-zinc-600">
                  Open the secure Rack Up page, choose an amount, and your points are added
                  automatically.
                </div>
              </div>
              {qrDataUrl ? (
                <div className="rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrDataUrl}
                    alt="QR code"
                    className="h-48 w-48 rounded-lg"
                  />
                </div>
              ) : (
                <div className="h-52 w-52 rounded-2xl border border-dashed border-black/20 p-4 text-sm text-zinc-500">
                  Generating QR…
                </div>
              )}
              <div className="text-xs text-zinc-600">
                Tip: Open your camera, scan the code, and follow the prompts.
              </div>
            </div>
          </div>
        </div>

        <div className="print:hidden">
          <Link className="text-sm underline" href="/admin/qrs">
            ← Back to QR list
          </Link>
        </div>

        <div className="mt-4 rounded-2xl bg-black/[.03] p-4 text-xs text-zinc-600 print:mt-2 print:text-[11px]">
          <div className="font-semibold text-zinc-900">How Rack Up works</div>
          <div className="mt-1">
            Scan the QR code to donate. Choose an amount, complete the secure checkout, and earn
            Rack Up points automatically. Points can be redeemed at any partner location.
          </div>
        </div>
      </div>
    </div>
  );
}
