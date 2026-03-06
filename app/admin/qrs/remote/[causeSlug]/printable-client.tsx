"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useReactToPrint } from "react-to-print";

type Config = {
  causeTitle: string;
  causeSlug: string;
  qrToken: string;
};

export default function PrintableRemoteCauseQr({ config }: { config: Config }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const printableRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const origin =
      typeof window !== "undefined"
        ? (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin).replace(/\/$/, "")
        : "";
    const url = `${origin}/donate/remote/${config.causeSlug}?qr=${encodeURIComponent(
      config.qrToken,
    )}`;
    async function generate() {
      const data = await QRCode.toDataURL(url, { margin: 1, width: 280 });
      setQrDataUrl(data);
    }
    void generate();
  }, [config.causeSlug, config.qrToken]);

  const handlePrint = useReactToPrint({
    contentRef: printableRef,
    documentTitle: `${config.causeSlug}-remote`,
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
            <h1 className="text-2xl font-semibold tracking-tight">Remote QR</h1>
            <div className="text-sm text-zinc-600">{config.causeTitle}</div>
          </div>
          <div className="flex gap-2">
            {qrDataUrl ? (
              <a
                href={qrDataUrl}
                download={`${config.causeSlug}-remote-qr.png`}
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
              <div className="text-xs uppercase tracking-wide text-zinc-600">Remote support</div>
              <div className="text-3xl font-semibold leading-tight">{config.causeTitle}</div>
              <p className="text-sm text-zinc-700">
                Scan to support this charity remotely. Remote points apply and each donation counts
                toward community drawings.
              </p>
              <div className="rounded-2xl bg-black/[.03] p-4 text-sm">
                <div className="font-semibold text-zinc-900">Remote support</div>
                <div className="text-zinc-700">
                  Use this QR for website, email, and social media.
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 bg-white p-6">
              <div className="w-full rounded-2xl border border-black/10 bg-black/[.03] p-4 text-center">
                <div className="text-sm font-semibold text-zinc-900">Scan to support remotely</div>
                <div className="mt-1 text-xs text-zinc-600">Opens the secure Rack Up page.</div>
              </div>
              {qrDataUrl ? (
                <div className="rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="QR code" className="h-48 w-48 rounded-lg" />
                </div>
              ) : (
                <div className="h-52 w-52 rounded-2xl border border-dashed border-black/20 p-4 text-sm text-zinc-500">
                  Generating QR…
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="print:hidden">
          <Link className="text-sm underline" href="/admin/qrs">
            ← Back to QR list
          </Link>
        </div>
      </div>
    </div>
  );
}
