"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/ui-kit/button";
import { Heading } from "@/ui-kit/heading";
import { Text } from "@/ui-kit/text";

type CauseListItem = {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  pointsDetails: {
    inPerson: string;
    remote: string;
  };
  supportHref: string;
};

function parseConversionItems(value: string): string[] | null {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  if (!parts.every((part) => part.includes("->"))) return null;
  return parts;
}

function PointsDetailLine({ label, value }: { label: string; value: string }) {
  const items = parseConversionItems(value);
  if (!items) {
    return (
      <Text>
        <span className="font-semibold text-white">{label}:</span> {value}
      </Text>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="text-sm font-semibold text-white">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={`${label}-${item}`}
            className="inline-flex rounded-md border border-white/15 bg-white/[0.03] px-2 py-1 text-xs text-zinc-200"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function CauseImage({ imageUrl, title }: { imageUrl?: string; title: string }) {
  if (imageUrl) {
    return (
      <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/[0.03] text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
      No image
    </div>
  );
}

export default function CauseSelectionList({ causes }: { causes: CauseListItem[] }) {
  const [selectedCause, setSelectedCause] = useState<CauseListItem | null>(null);

  useEffect(() => {
    if (!selectedCause) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedCause(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedCause]);

  return (
    <>
      <div className="space-y-4">
        {causes.map((cause) => (
          <div
            key={cause.id}
            className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/30 sm:p-5"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <CauseImage imageUrl={cause.imageUrl} title={cause.title} />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setSelectedCause(cause)}
                >
                  <Heading level={2} className="text-xl font-semibold text-white">
                    {cause.title}
                  </Heading>
                  {cause.description ? (
                    <Text className="mt-1 text-zinc-300">{cause.description}</Text>
                  ) : null}
                  <div className="mt-2 space-y-2">
                    <PointsDetailLine label="In-person points" value={cause.pointsDetails.inPerson} />
                    <PointsDetailLine label="Remote points" value={cause.pointsDetails.remote} />
                  </div>
                </button>
              </div>
              <div className="flex shrink-0 items-center gap-2 self-end sm:self-start">
                <Button plain onClick={() => setSelectedCause(cause)}>
                  View details
                </Button>
                <Button href={cause.supportHref} color="emerald">
                  Support this cause
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedCause ? (
        <div
          className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-8 backdrop-blur-sm sm:py-12"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedCause(null);
          }}
        >
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#0d1117] text-white shadow-2xl shadow-black/50">
            <div className="flex items-start justify-between border-b border-white/[0.06] bg-white/[0.02] px-6 py-4">
              <div>
                <Heading level={2} className="text-xl font-semibold text-white">
                  {selectedCause.title}
                </Heading>
                <Text className="mt-1 text-xs text-zinc-400">Cause ID: {selectedCause.id}</Text>
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
                onClick={() => setSelectedCause(null)}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 p-6">
              <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-3">
                {selectedCause.imageUrl ? (
                  // Show full image aspect ratio in modal.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedCause.imageUrl}
                    alt={selectedCause.title}
                    className="mx-auto max-h-[60vh] w-full object-contain"
                  />
                ) : (
                  <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/[0.02] text-sm font-medium text-zinc-500">
                    No image available
                  </div>
                )}
              </div>

              {selectedCause.description ? (
                <Text className="text-zinc-200">{selectedCause.description}</Text>
              ) : null}
              <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Points details</div>
                <PointsDetailLine label="In-person" value={selectedCause.pointsDetails.inPerson} />
                <PointsDetailLine label="Remote" value={selectedCause.pointsDetails.remote} />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button plain onClick={() => setSelectedCause(null)}>
                  Close
                </Button>
                <Button href={selectedCause.supportHref} color="emerald">
                  Support this cause
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
