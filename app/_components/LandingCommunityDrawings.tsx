"use client";

import { useEffect, useMemo, useState } from "react";

type LandingCommunityDrawing = {
  id: string;
  title: string;
  description?: string;
  prize?: {
    name?: string;
    value?: string;
    imageUrl?: string;
    description?: string;
  } | null;
};

export default function LandingCommunityDrawings({
  drawings,
}: {
  drawings: LandingCommunityDrawing[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => drawings.find((drawing) => drawing.id === selectedId) ?? null,
    [drawings, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selected]);

  if (drawings.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-400/20 bg-gradient-to-b from-emerald-500/[0.08] to-transparent p-5 text-sm text-zinc-300">
        No community drawing items are published right now.
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {drawings.map((drawing) => (
          <button
            key={`drawing-${drawing.id}`}
            type="button"
            onClick={() => setSelectedId(drawing.id)}
            className="group rounded-xl border border-emerald-400/20 bg-gradient-to-b from-emerald-500/[0.08] to-transparent p-4 text-left transition hover:border-emerald-400/40 hover:from-emerald-500/[0.12]"
          >
            {drawing.prize?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={drawing.prize.imageUrl}
                alt={drawing.prize?.name ?? drawing.title}
                className="h-48 w-full rounded-lg border border-white/10 object-cover transition group-hover:border-white/20"
              />
            ) : (
              <div className="flex h-48 w-full items-center justify-center rounded-lg border border-white/10 bg-black/30 text-xs text-zinc-500">
                Prize image coming soon
              </div>
            )}
            <div className="mt-4 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-emerald-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Active community drawing
            </div>
            <div className="mt-1 text-lg font-semibold text-white">{drawing.prize?.name ?? drawing.title}</div>
            {drawing.prize?.value ? (
              <div className="mt-1 text-sm font-medium text-emerald-200/80">
                Estimated value: {drawing.prize.value}
              </div>
            ) : null}
            {drawing.prize?.description ? (
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-300">{drawing.prize.description}</p>
            ) : drawing.description ? (
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-300">{drawing.description}</p>
            ) : null}
          </button>
        ))}
      </div>

      {selected ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedId(null);
          }}
        >
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-white/15 bg-[#0d1117] shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="text-sm font-semibold text-white">Community Drawing Details</div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/10 hover:text-white"
                onClick={() => setSelectedId(null)}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="grid gap-0 md:grid-cols-2">
              <div className="flex items-center justify-center bg-black/30 p-4">
                {selected.prize?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.prize.imageUrl}
                    alt={selected.prize?.name ?? selected.title}
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
                <h3 className="text-2xl font-semibold text-white">{selected.prize?.name ?? selected.title}</h3>
                {selected.prize?.value ? (
                  <div className="text-sm font-semibold text-emerald-200">Estimated value: {selected.prize.value}</div>
                ) : null}
                {selected.prize?.description ? (
                  <p className="text-sm leading-relaxed text-zinc-300">{selected.prize.description}</p>
                ) : null}
                {selected.description ? (
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Details</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                      {selected.description}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
