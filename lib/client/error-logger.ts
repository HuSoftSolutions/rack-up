"use client";

type ClientErrorPayload = {
  kind: "window_error" | "unhandled_rejection" | "react_error_boundary" | "manual";
  message: string;
  name?: string;
  stack?: string | null;
  componentStack?: string | null;
  path?: string | null;
  href?: string | null;
  userAgent?: string | null;
  extra?: Record<string, unknown> | null;
  at?: string;
};

const RECENT = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10_000;

function now() {
  return Date.now();
}

function trim(value: string, max: number) {
  return value.length > max ? value.slice(0, max) : value;
}

function cleanupRecent(current: number) {
  RECENT.forEach((seenAt, key) => {
    if (current - seenAt > DEDUPE_WINDOW_MS) RECENT.delete(key);
  });
}

export function normalizeReason(reason: unknown): {
  message: string;
  name?: string;
  stack?: string | null;
  extra?: Record<string, unknown> | null;
} {
  if (reason instanceof Error) {
    return {
      message: reason.message || "Unknown client error",
      name: reason.name,
      stack: reason.stack ?? null,
      extra: null,
    };
  }
  if (typeof reason === "string") {
    return { message: reason, extra: null };
  }
  if (reason && typeof reason === "object") {
    try {
      return {
        message: "Unhandled rejection (non-Error object)",
        extra: JSON.parse(JSON.stringify(reason)) as Record<string, unknown>,
      };
    } catch {
      return { message: "Unhandled rejection (non-serializable object)", extra: null };
    }
  }
  return { message: "Unknown client error", extra: null };
}

function shouldSkip(payload: ClientErrorPayload) {
  const key = `${payload.kind}:${payload.message}:${payload.name ?? ""}:${payload.path ?? ""}`;
  const current = now();
  cleanupRecent(current);
  const last = RECENT.get(key);
  if (last && current - last < DEDUPE_WINDOW_MS) return true;
  RECENT.set(key, current);
  return false;
}

export async function logClientError(partial: Omit<ClientErrorPayload, "at" | "path" | "href" | "userAgent"> & {
  path?: string | null;
  href?: string | null;
}) {
  if (typeof window === "undefined") return;
  const payload: ClientErrorPayload = {
    ...partial,
    message: trim(partial.message || "Unknown client error", 2000),
    name: partial.name ? trim(partial.name, 200) : undefined,
    stack: partial.stack ? trim(partial.stack, 12000) : null,
    componentStack: partial.componentStack ? trim(partial.componentStack, 12000) : null,
    path: partial.path ?? window.location.pathname,
    href: partial.href ?? window.location.href,
    userAgent: window.navigator.userAgent,
    at: new Date().toISOString(),
  };
  if (shouldSkip(payload)) return;

  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/client-errors", blob);
      return;
    }
  } catch {
    // Fallback to fetch.
  }

  try {
    await fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // Avoid throwing from logger path.
  }
}
