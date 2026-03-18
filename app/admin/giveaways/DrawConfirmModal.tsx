"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type DrawnWinner = {
  name: string;
  index: number;
};

type DrawConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  onDraw: () => Promise<{ winners: DrawnWinner[]; error?: string }>;
  onRepick: (winnerIndex: number) => Promise<{ winner: DrawnWinner | null; error?: string }>;
  /** Called when admin confirms the winners – passes the final list to open the reveal modal. */
  onConfirm: (winners: DrawnWinner[]) => void;
  giveawayTitle: string;
  winnersToDrawCount: number;
};

type Phase = "idle" | "drawing" | "verify" | "repicking" | "error";

export default function DrawConfirmModal({
  open,
  onClose,
  onDraw,
  onRepick,
  onConfirm,
  giveawayTitle,
  winnersToDrawCount,
}: DrawConfirmModalProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [allWinners, setAllWinners] = useState<DrawnWinner[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [repickingIndex, setRepickingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setPhase("idle");
      setAllWinners([]);
      setErrorMsg("");
      setRepickingIndex(null);
    }
  }, [open]);

  const startDraw = useCallback(async () => {
    setPhase("drawing");
    setErrorMsg("");

    const result = await onDraw();

    if (!result.winners.length) {
      setPhase("error");
      setErrorMsg(result.error ?? "Failed to draw winner.");
      return;
    }

    setAllWinners(result.winners);
    setPhase("verify");
  }, [onDraw]);

  const handleRepick = useCallback(async (winnerIndex: number) => {
    setRepickingIndex(winnerIndex);
    setPhase("repicking");

    const result = await onRepick(winnerIndex);

    if (!result.winner) {
      setErrorMsg(result.error ?? "Failed to repick.");
      setRepickingIndex(null);
      setPhase("verify");
      return;
    }

    setAllWinners((prev) => {
      const updated = [...prev];
      const idx = updated.findIndex((w) => w.index === winnerIndex);
      if (idx !== -1) {
        updated[idx] = result.winner!;
      }
      return updated;
    });
    setErrorMsg("");
    setRepickingIndex(null);
    setPhase("verify");
  }, [onRepick]);

  const isMulti = winnersToDrawCount > 1;

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={phase !== "drawing" && phase !== "repicking" ? onClose : undefined}
      />

      {/* Modal */}
      <div className="animate-in fade-in slide-in-from-bottom-4 relative z-10 w-full max-w-md rounded-xl border border-white/10 bg-[#0f1217] px-6 py-6 shadow-2xl">
        {/* Header */}
        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400/70">
            Draw Winners
          </div>
          <div className="mt-1 text-base font-bold text-white">{giveawayTitle}</div>
        </div>

        {/* ── idle ── */}
        {phase === "idle" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              This will randomly select {isMulti ? `${winnersToDrawCount} winners` : "a winner"} from
              all eligible entries. You can review and repick before revealing.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                onClick={startDraw}
              >
                {isMulti ? `Draw ${winnersToDrawCount} Winners` : "Draw Winner"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/10"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── drawing ── */}
        {phase === "drawing" && (
          <div className="flex items-center gap-2 py-4 text-sm text-zinc-400">
            <svg className="h-4 w-4 animate-spin text-emerald-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Drawing winner{isMulti ? "s" : ""}…
          </div>
        )}

        {/* ── verify / repicking ── */}
        {(phase === "verify" || phase === "repicking") && (
          <div className="space-y-4">
            <p className="text-xs text-zinc-500">
              Review the selected winner{isMulti ? "s" : ""} below. Repick any if needed, then confirm to start the reveal animation.
            </p>

            {errorMsg && (
              <div className="text-xs text-rose-400">{errorMsg}</div>
            )}

            <div className="space-y-2">
              {allWinners.map((winner, i) => (
                <div
                  key={`verify-${winner.index}-${winner.name}`}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-300">
                      {i + 1}
                    </span>
                    <span className="text-sm font-semibold text-white">
                      {winner.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`rounded-md border px-3 py-1 text-xs font-semibold transition ${
                      repickingIndex === winner.index
                        ? "border-amber-400/30 bg-amber-500/10 text-amber-300 cursor-wait"
                        : "border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                    }`}
                    disabled={phase === "repicking"}
                    onClick={() => handleRepick(winner.index)}
                  >
                    {repickingIndex === winner.index ? "Repicking…" : "Repick"}
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={phase === "repicking"}
                onClick={() => onConfirm(allWinners)}
              >
                Confirm &amp; Reveal
              </button>
              <button
                type="button"
                className="rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={phase === "repicking"}
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── error ── */}
        {phase === "error" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-rose-400/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
              {errorMsg}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                onClick={() => {
                  setPhase("idle");
                  setErrorMsg("");
                }}
              >
                Try again
              </button>
              <button
                type="button"
                className="rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/10"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
