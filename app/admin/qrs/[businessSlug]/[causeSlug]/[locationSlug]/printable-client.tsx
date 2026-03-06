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

export default function PrintableQr({
  config,
  backHref = "/admin/qrs",
  backLabel = "← Back to QR list",
}: {
  config: Config;
  backHref?: string;
  backLabel?: string;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const printableRef = useRef<HTMLDivElement | null>(null);
  const causeDescription = config.cause.description?.trim() ?? "";
  const printableDescription =
    causeDescription.length > 600 ? `${causeDescription.slice(0, 597)}...` : causeDescription;

  useEffect(() => {
    const origin =
      typeof window !== "undefined"
        ? (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin).replace(/\/$/, "")
        : "";
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
          return `Choose a preset amount to support and earn Rack Up points instantly. Options: ${opts
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
          return `Support any amount${range ? ` (${range})` : ""} and earn ${
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
        className="mx-auto flex w-full max-w-[8.27in] flex-col gap-3 bg-white px-6 py-6 print:min-h-[10.8in] print:max-w-none print:gap-2 print:px-4 print:py-4"
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

        <div className="flex flex-1 flex-col rounded-2xl border border-black/10 bg-white p-4 text-black shadow-sm print:min-h-[10.2in] print:rounded-none print:border-none print:p-2 print:shadow-none break-inside-avoid">
          <div className="flex items-center justify-between gap-3">
            <div className="rounded-xl bg-black p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/RackUp-01.svg" alt="Rack Up" className="h-7 w-auto" />
            </div>
            <div className="flex items-center gap-2">
              {config.business.logoUrl ? (
                <div className="rounded-xl bg-black p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={config.business.logoUrl}
                    alt={`${config.business.name} logo`}
                    className="h-10 w-auto max-w-[140px] object-contain"
                  />
                </div>
              ) : null}
              {config.location.logoUrl ? (
                <div className="rounded-xl bg-black p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={config.location.logoUrl}
                    alt={`${config.location.name ?? config.location.id} logo`}
                    className="h-10 w-auto max-w-[140px] object-contain"
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 text-xs font-semibold uppercase tracking-wide text-black">
            {config.business.name} · {config.location.name}
          </div>
          <div className="mt-1 text-3xl font-semibold leading-tight text-black print:text-[30px]">{config.cause.title}</div>
          {printableDescription ? (
            <p className="mt-2 text-sm leading-6 text-black print:text-[13px] print:leading-5">{printableDescription}</p>
          ) : null}

          <div className="mt-3 rounded-2xl border border-black/10 bg-black/[.03] p-3 text-sm text-black print:text-[13px]">
            <div className="font-semibold text-black">How to earn points here</div>
            <div className="text-black">{pointsText}</div>
          </div>

          <div className="mt-5 flex flex-1 items-center justify-center">
            {qrDataUrl ? (
              <div className="rounded-2xl border border-black/10 bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR code" className="h-64 w-64 print:h-72 print:w-72" />
              </div>
            ) : (
              <div className="h-64 w-64 rounded-2xl border border-dashed border-black/20 p-4 text-sm text-black/70">
                Generating QR…
              </div>
            )}
          </div>

          <div className="mt-auto rounded-2xl border border-black/10 bg-black/[.03] p-3 text-center text-black">
            <div className="text-base font-semibold">Scan this QR code to support this cause</div>
            <div className="mt-1 text-sm">
              Open the secure Rack Up page, choose an amount, and your points are added automatically.
            </div>
            <div className="mt-1 text-xs">Tip: Open your camera, scan the code, and follow the prompts.</div>
          </div>
        </div>

        <div className="print:hidden">
          <Link className="text-sm underline" href={backHref}>
            {backLabel}
          </Link>
        </div>

        <div className="mt-4 rounded-2xl bg-black/[.03] p-4 text-xs text-zinc-700 print:hidden">
          <div className="font-semibold text-zinc-900">How Rack Up works</div>
          <div className="mt-1">
            Scan the QR code to support. Choose an amount, complete the secure checkout, and earn
            Rack Up points automatically. Points can be redeemed at any partner location.
          </div>
        </div>
      </div>
    </div>
  );
}
