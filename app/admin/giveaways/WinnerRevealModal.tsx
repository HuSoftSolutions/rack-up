"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";

type DrawnWinner = {
  name: string;
  index: number;
};

type WinnerRevealModalProps = {
  open: boolean;
  onClose: () => void;
  /** Pre-confirmed winners to reveal with the animation. */
  winners: DrawnWinner[];
  prizeName?: string;
  prizeImageUrl?: string;
  giveawayTitle: string;
  giveawayId?: string;
  getIdToken?: () => Promise<string>;
};

const FIRST_NAMES = [
  "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Quinn",
  "Avery", "Jamie", "Drew", "Parker", "Sage", "Reese", "Dakota",
  "Skyler", "Hayden", "Rowan", "Blake", "Emery", "Finley",
  "Cameron", "Charlie", "Kendall", "Peyton", "Marley", "Remy",
  "Phoenix", "Ellis", "Arden", "Jules", "Harley", "River",
  "Logan", "Sawyer", "Micah", "Eden", "Kai", "Shiloh",
];

const LAST_NAMES = [
  "Anderson", "Brooks", "Campbell", "Davis", "Edwards", "Foster",
  "Garcia", "Hayes", "Jackson", "Kelly", "Lawrence", "Mitchell",
  "Nelson", "O'Brien", "Palmer", "Quinn", "Reynolds", "Stewart",
  "Thompson", "Vaughn", "Wallace", "Young", "Bennett", "Collins",
  "Dixon", "Fletcher", "Graham", "Harper", "Ingram", "Jensen",
];

function randomFullName(): string {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

async function fireConfetti() {
  const confetti = (await import("canvas-confetti")).default;
  confetti({
    particleCount: 150,
    spread: 90,
    origin: { y: 0.55 },
    colors: ["#10b981", "#6366f1", "#f59e0b", "#ec4899", "#06b6d4"],
    startVelocity: 45,
    gravity: 0.8,
    ticks: 300,
  });
  setTimeout(() => {
    confetti({
      particleCount: 80,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.6 },
      colors: ["#10b981", "#6366f1", "#f59e0b", "#ec4899"],
    });
    confetti({
      particleCount: 80,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.6 },
      colors: ["#10b981", "#6366f1", "#f59e0b", "#ec4899"],
    });
  }, 250);
  setTimeout(() => {
    confetti({
      particleCount: 60,
      spread: 120,
      origin: { y: 0.45 },
      colors: ["#fbbf24", "#a78bfa", "#34d399"],
      startVelocity: 30,
    });
  }, 600);
}

type Phase = "ready" | "spinning" | "slowing" | "winner-shown" | "all-done";

export default function WinnerRevealModal({
  open,
  onClose,
  winners,
  prizeName,
  prizeImageUrl,
  giveawayTitle,
  giveawayId,
  getIdToken,
}: WinnerRevealModalProps) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [displayName, setDisplayName] = useState("");
  const [revealedWinners, setRevealedWinners] = useState<string[]>([]);
  const [currentRevealIndex, setCurrentRevealIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const giveawayIdRef = useRef(giveawayId);
  giveawayIdRef.current = giveawayId;
  const getIdTokenRef = useRef(getIdToken);
  getIdTokenRef.current = getIdToken;

  // ── Screen recording state ──
  const [isRecording, setIsRecording] = useState(false);
  const [videoStatus, setVideoStatus] = useState<"idle" | "converting" | "done" | "error">("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" } as MediaTrackConstraints,
        audio: false,
        // @ts-expect-error -- preferCurrentTab is supported in Chromium browsers
        preferCurrentTab: true,
      });
      streamRef.current = stream;

      // If the user cancels the share prompt or stops sharing
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        stopRecording();
      });

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        if (recordedChunksRef.current.length === 0) return;
        const webmBlob = new Blob(recordedChunksRef.current, { type: mimeType });
        recordedChunksRef.current = [];
        if (webmBlob.size === 0) return;

        setVideoStatus("converting");

        // Upload to server for storage + Cloud Function MP4 conversion
        const formData = new FormData();
        formData.append("video", webmBlob, "recording.webm");
        if (giveawayIdRef.current) formData.append("giveawayId", giveawayIdRef.current);

        const tokenFn = getIdTokenRef.current;
        (tokenFn ? tokenFn().catch(() => null) : Promise.resolve(null))
          .then((token) => fetch("/api/admin/convert-video", {
            method: "POST",
            body: formData,
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }))
          .then(async (res) => {
            if (!res.ok) throw new Error("Upload failed");
            setVideoStatus("done");
          })
          .catch(() => {
            setVideoStatus("done");
          });
      };

      // Delay recording start so the tab-share UI glitch isn't captured
      await new Promise((r) => setTimeout(r, 1000));

      // Use timeslice to collect data periodically instead of only on stop
      recorder.start(1000);
      setIsRecording(true);

    } catch {
      // User cancelled the share prompt
      setIsRecording(false);
    }
  }, [stopRecording]);

  const cleanup = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    intervalRef.current = null;
    timeoutRef.current = null;
  }, []);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setPhase("ready");
      setDisplayName("");
      setRevealedWinners([]);
      setCurrentRevealIndex(0);
      setVideoStatus("idle");
      cancelledRef.current = false;
      cleanup();
    } else {
      cancelledRef.current = true;
      cleanup();
      stopRecording();
    }
    return cleanup;
  }, [open, cleanup, stopRecording]);

  /** Spin + slow-down animation for a single winner name. */
  const revealOneWinner = useCallback((winnerName: string, onDone: () => void) => {
    setPhase("spinning");
    setDisplayName(randomFullName());

    intervalRef.current = setInterval(() => {
      setDisplayName(randomFullName());
    }, 60);

    timeoutRef.current = setTimeout(() => {
      setPhase("slowing");
      cleanup();

      const speeds = [100, 150, 220, 320, 450, 600, 800];
      let step = 0;

      function tick() {
        if (cancelledRef.current) return;
        if (step < speeds.length) {
          setDisplayName(step === speeds.length - 1 ? winnerName : randomFullName());
          timeoutRef.current = setTimeout(tick, speeds[step]);
          step++;
        } else {
          setDisplayName(winnerName);
          setPhase("winner-shown");
          void fireConfetti();
          onDone();
        }
      }
      tick();
    }, 1500);
  }, [cleanup]);

  /** Start reveal of the first winner. */
  const startReveal = useCallback(() => {
    if (!winners.length) return;
    setCurrentRevealIndex(0);
    setRevealedWinners([]);
    revealOneWinner(winners[0].name, () => {
      setRevealedWinners([winners[0].name]);
    });
  }, [winners, revealOneWinner]);

  /** Reveal the next winner in sequence. */
  const revealNext = useCallback(() => {
    const nextIndex = currentRevealIndex + 1;
    if (nextIndex >= winners.length) {
      setPhase("all-done");
      return;
    }
    setCurrentRevealIndex(nextIndex);
    revealOneWinner(winners[nextIndex].name, () => {
      setRevealedWinners((prev) => [...prev, winners[nextIndex].name]);
    });
  }, [currentRevealIndex, winners, revealOneWinner]);

  // Auto-stop recording when drawing completes
  const allRevealed = phase === "all-done" || (phase === "winner-shown" && currentRevealIndex + 1 >= winners.length);
  useEffect(() => {
    if (allRevealed && isRecording) {
      // Small delay so the final confetti is captured
      const t = setTimeout(() => stopRecording(), 4000);
      return () => clearTimeout(t);
    }
  }, [allRevealed, isRecording, stopRecording]);

  // Auto-dismiss "done" status after 4 seconds
  useEffect(() => {
    if (videoStatus === "done") {
      const t = setTimeout(() => setVideoStatus("idle"), 4000);
      return () => clearTimeout(t);
    }
  }, [videoStatus]);

  const isMulti = winners.length > 1;
  const isSpinning = phase === "spinning" || phase === "slowing";
  const hasMoreWinners = phase === "winner-shown" && currentRevealIndex + 1 < winners.length;

  const showModal = open && winners.length > 0;
  const showToast = videoStatus === "converting" || videoStatus === "done";

  if (!showModal && !showToast) return null;

  return createPortal(
    <>
    {/* Video processing toast — visible even after modal closes */}
    <AnimatePresence>
      {showToast && (
        <motion.div
          className="fixed bottom-6 right-6 z-[110] flex items-center gap-3 rounded-xl border border-white/10 bg-[#0f1520] px-5 py-3 shadow-2xl"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
        >
          {videoStatus === "converting" && (
            <>
              <svg className="h-4 w-4 animate-spin text-amber-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm font-medium text-white/80">Uploading video…</span>
            </>
          )}
          {videoStatus === "done" && (
            <>
              <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span className="text-sm font-medium text-white/80">Video saved! MP4 will be available shortly.</span>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>

    <AnimatePresence>
      {showModal && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            onClick={phase === "all-done" || (phase === "winner-shown" && !hasMoreWinners) ? onClose : undefined}
          />

          {/* Modal Content */}
          <motion.div
            className="relative z-10 flex min-h-[480px] w-full max-w-lg flex-col items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-b from-[#0f1520] to-[#0a0e16] px-8 py-10 shadow-2xl shadow-emerald-500/10"
            initial={{ scale: 0.85, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 40 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Glow */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
              <div
                className={`absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px] transition-all duration-1000 ${
                  phase === "winner-shown" || phase === "all-done"
                    ? "bg-emerald-500/40 scale-150"
                    : isSpinning
                      ? "bg-violet-500/20 scale-100 animate-pulse"
                      : "bg-white/5 scale-75"
                }`}
              />
            </div>

            {/* Title */}
            <div className="relative mb-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/70">
              Community Drawing
            </div>
            <div className="relative mb-6 text-center text-lg font-bold text-white">
              {giveawayTitle}
            </div>

            {/* Prize image */}
            {prizeImageUrl && (
              <div className="relative mb-4 h-20 w-20 overflow-hidden rounded-xl border border-white/10 shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={prizeImageUrl} alt="Prize" className="h-full w-full object-cover" />
              </div>
            )}

            {/* Prize name */}
            {prizeName && (
              <div className="relative mb-6 text-center text-sm font-medium text-amber-300/90">
                {prizeName}
              </div>
            )}

            {/* Multi-winner progress */}
            {isMulti && phase !== "ready" && (
              <div className="relative mb-3 text-center text-xs font-medium text-white/50">
                Winner {Math.min(currentRevealIndex + 1, winners.length)} of {winners.length}
              </div>
            )}

            {/* Slot machine display */}
            <div className="relative mb-6 w-full">
              <div
                className={`relative overflow-hidden rounded-xl border-2 px-6 py-6 text-center transition-colors duration-500 ${
                  phase === "winner-shown" || phase === "all-done"
                    ? "border-emerald-400/60 bg-emerald-500/10 shadow-lg shadow-emerald-500/20"
                    : isSpinning
                      ? "border-violet-400/40 bg-violet-500/5"
                      : "border-white/10 bg-white/5"
                }`}
              >
                {/* Scan line */}
                {isSpinning && (
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-400/50 to-transparent animate-[scan_1.5s_linear_infinite]" />
                  </div>
                )}

                {phase === "ready" && (
                  <div className="text-2xl font-bold tracking-wide text-white/30">
                    {isMulti ? `${winners.length} Winners` : "???"}
                  </div>
                )}

                {isSpinning && (
                  <motion.div
                    key={displayName}
                    className="text-3xl font-extrabold tracking-wide text-white/80"
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.05 }}
                  >
                    {displayName}
                  </motion.div>
                )}

                {(phase === "winner-shown" || phase === "all-done") && (
                  <motion.div
                    key={`winner-${currentRevealIndex}`}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.1 }}
                  >
                    <div className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-400/70 mb-2">
                      {isMulti ? `Winner #${currentRevealIndex + 1}` : "Winner"}
                    </div>
                    <div className="text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-200 to-emerald-400 drop-shadow-lg sm:text-5xl">
                      {winners[currentRevealIndex]?.name}
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Side decorations */}
              {isSpinning && (
                <>
                  <div className="absolute top-1/2 left-0 h-4 w-1 -translate-y-1/2 rounded-r-full bg-violet-400/60 animate-pulse" />
                  <div className="absolute top-1/2 right-0 h-4 w-1 -translate-y-1/2 rounded-l-full bg-violet-400/60 animate-pulse" />
                </>
              )}
            </div>

            {/* Previously revealed winners (multi-winner) */}
            {isMulti && revealedWinners.length > 0 && (
              <div className="relative mb-6 w-full">
                <div className="flex flex-wrap justify-center gap-2">
                  {revealedWinners.map((name, i) => {
                    const isCurrent = i === currentRevealIndex && (phase === "winner-shown" || phase === "all-done");
                    if (isCurrent) return null;
                    return (
                      <motion.div
                        key={`prev-${i}`}
                        className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                      >
                        #{i + 1} {name}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recording indicator — only shown in ready phase so it doesn't appear in the recorded video */}
            {isRecording && phase === "ready" && (
              <div className="absolute top-4 right-4 flex items-center gap-2 rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1.5">
                <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                <span className="text-xs font-semibold text-red-300">REC</span>
              </div>
            )}

            {/* Actions */}
            <div className="relative flex flex-col items-center gap-3">
              {phase === "ready" && (
                <div className="flex flex-col items-center gap-3">
                  {!isRecording && (
                    <motion.button
                      type="button"
                      className="rounded-xl border border-red-400/30 bg-red-500/10 px-6 py-2.5 text-xs font-semibold tracking-wide text-red-300 transition hover:bg-red-500/20"
                      onClick={startRecording}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <span className="flex items-center gap-2">
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="12" r="8" />
                        </svg>
                        RECORD DRAWING
                      </span>
                    </motion.button>
                  )}
                  {isRecording && (
                    <div className="text-xs text-red-300/70">Recording — press reveal when ready!</div>
                  )}
                  <motion.button
                    type="button"
                    className="rounded-xl border border-emerald-400/40 bg-gradient-to-r from-emerald-600 to-emerald-500 px-8 py-3 text-sm font-bold tracking-wide text-white shadow-lg shadow-emerald-500/25 transition hover:shadow-emerald-500/40 hover:brightness-110"
                    onClick={startReveal}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    {isMulti ? `REVEAL ${winners.length} WINNERS` : "REVEAL WINNER"}
                  </motion.button>
                </div>
              )}

              {isSpinning && (
                <div className="flex items-center gap-2 text-sm text-violet-300/80">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Selecting winner{isMulti ? ` #${currentRevealIndex + 1}` : ""}…
                </div>
              )}

              {phase === "winner-shown" && hasMoreWinners && (
                <motion.button
                  type="button"
                  className="rounded-xl border border-emerald-400/40 bg-gradient-to-r from-emerald-600 to-emerald-500 px-8 py-3 text-sm font-bold tracking-wide text-white shadow-lg shadow-emerald-500/25 transition hover:shadow-emerald-500/40 hover:brightness-110"
                  onClick={revealNext}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.97 }}
                >
                  NEXT WINNER
                </motion.button>
              )}

              {(phase === "all-done" || (phase === "winner-shown" && !hasMoreWinners)) && (
                <motion.button
                  type="button"
                  className="rounded-xl border border-white/20 bg-white/10 px-8 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
                  onClick={onClose}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 }}
                  whileHover={{ scale: 1.03 }}
                >
                  Close
                </motion.button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>,
    document.body,
  );
}
