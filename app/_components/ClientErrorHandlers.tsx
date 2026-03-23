"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  logClientError,
  normalizeReason,
  shouldIgnoreClientRuntimeError,
} from "@/lib/client/error-logger";
import { useToast } from "@/app/_components/ToastProvider";

const TOAST_DEDUPE_WINDOW_MS = 15_000;
let lastToastAt = 0;
let lastToastKey = "";
const CHUNK_RELOAD_KEY = "rackup:chunk-reload-at";
const CHUNK_RELOAD_WINDOW_MS = 60_000;

function looksLikeChunkError(message: string) {
  const value = message.toLowerCase();
  return (
    value.includes("chunkloaderror") ||
    value.includes("loading chunk") ||
    value.includes("failed to fetch dynamically imported module")
  );
}

function shouldShowErrorToast(message: string) {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return false;
  const now = Date.now();
  const key = message.toLowerCase();
  if (key === lastToastKey && now - lastToastAt < TOAST_DEDUPE_WINDOW_MS) return false;
  lastToastKey = key;
  lastToastAt = now;
  return true;
}

function shouldReloadForChunkError() {
  if (typeof window === "undefined") return false;
  try {
    const lastRaw = window.sessionStorage.getItem(CHUNK_RELOAD_KEY);
    const last = Number(lastRaw ?? "0");
    const now = Date.now();
    if (Number.isFinite(last) && now - last < CHUNK_RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
    return true;
  } catch {
    // If storage fails, still allow one-shot reload attempt.
    return true;
  }
}

function recoverChunkMismatch() {
  if (!shouldReloadForChunkError()) return;
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    window.location.reload();
  }, 120);
}

export default function ClientErrorHandlers() {
  const pathname = usePathname();
  const { pushToast } = useToast();

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const normalized = normalizeReason(event.error ?? event.message ?? "Window error");
      if (
        shouldIgnoreClientRuntimeError({
          message: normalized.message,
          name: normalized.name ?? event.error?.name ?? null,
          stack: normalized.stack ?? (event.error instanceof Error ? event.error.stack ?? null : null),
        })
      ) {
        return;
      }
      void logClientError({
        kind: "window_error",
        message: normalized.message,
        name: normalized.name ?? event.error?.name,
        stack: normalized.stack ?? (event.error instanceof Error ? event.error.stack ?? null : null),
        extra: {
          source: event.filename ?? null,
          line: event.lineno ?? null,
          column: event.colno ?? null,
        },
        path: pathname ?? null,
      });
      if (looksLikeChunkError(normalized.message)) {
        recoverChunkMismatch();
      }
      if (shouldShowErrorToast(normalized.message)) {
        pushToast({
          tone: "error",
          title: looksLikeChunkError(normalized.message) ? "App updated. Refresh may be needed." : "Something went wrong",
          description: "We logged this issue and are monitoring it.",
        });
      }
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const normalized = normalizeReason(event.reason);
      if (
        shouldIgnoreClientRuntimeError({
          message: normalized.message,
          name: normalized.name ?? null,
          stack: normalized.stack ?? null,
        })
      ) {
        return;
      }
      void logClientError({
        kind: "unhandled_rejection",
        message: normalized.message,
        name: normalized.name,
        stack: normalized.stack,
        extra: normalized.extra,
        path: pathname ?? null,
      });
      if (looksLikeChunkError(normalized.message)) {
        recoverChunkMismatch();
      }
      if (shouldShowErrorToast(normalized.message)) {
        pushToast({
          tone: "error",
          title: looksLikeChunkError(normalized.message) ? "App updated. Refresh may be needed." : "Unexpected issue detected",
          description: "We logged this issue and are monitoring it.",
        });
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [pathname, pushToast]);

  return null;
}
