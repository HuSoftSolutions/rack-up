"use client";

export function normalizeClientRequestError(error: unknown, fallback: string) {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : fallback;
  const message = (raw || fallback).trim() || fallback;
  const lower = message.toLowerCase();
  const authCodeMatch = lower.match(/auth\/([a-z0-9-]+)/);
  const authCode = authCodeMatch?.[1] ?? null;

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed")
  ) {
    return "Network issue detected. Check your connection and retry.";
  }
  if (lower.includes("permission") || lower.includes("insufficient permissions")) {
    return "You do not have permission to perform this action.";
  }
  if (authCode === "invalid-credential" || authCode === "invalid-login-credentials") {
    return "Invalid email or password.";
  }
  if (authCode === "wrong-password" || authCode === "user-not-found") {
    return "Invalid email or password.";
  }
  if (authCode === "too-many-requests") {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (
    authCode === "user-token-expired" ||
    authCode === "id-token-expired" ||
    authCode === "requires-recent-login"
  ) {
    return "Your session expired. Sign in again and retry.";
  }
  if (lower.includes("unauthenticated")) {
    return "Your session expired. Sign in again and retry.";
  }
  if (lower.includes("unavailable") || lower.includes("offline")) {
    return "Service is temporarily unavailable. Please retry.";
  }

  return message;
}
