"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { logClientError, normalizeReason } from "@/lib/client/error-logger";
import { useToast } from "@/app/_components/ToastProvider";

function looksLikeChunkError(message: string) {
  const value = message.toLowerCase();
  return (
    value.includes("chunkloaderror") ||
    value.includes("loading chunk") ||
    value.includes("failed to fetch dynamically imported module")
  );
}

export default function ClientErrorHandlers() {
  const pathname = usePathname();
  const { pushToast } = useToast();

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const normalized = normalizeReason(event.error ?? event.message ?? "Window error");
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
      pushToast({
        tone: "error",
        title: looksLikeChunkError(normalized.message) ? "App updated. Refresh may be needed." : "Something went wrong",
        description: "We logged this issue and are monitoring it.",
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const normalized = normalizeReason(event.reason);
      void logClientError({
        kind: "unhandled_rejection",
        message: normalized.message,
        name: normalized.name,
        stack: normalized.stack,
        extra: normalized.extra,
        path: pathname ?? null,
      });
      pushToast({
        tone: "error",
        title: looksLikeChunkError(normalized.message) ? "App updated. Refresh may be needed." : "Unexpected issue detected",
        description: "We logged this issue and are monitoring it.",
      });
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
