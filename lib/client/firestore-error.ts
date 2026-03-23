"use client";

type FirestoreListenerError = {
  rawMessage: string;
  userMessage: string;
  isMissingIndex: boolean;
  isPermission: boolean;
  isTransientStorage: boolean;
};

function toMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

export function normalizeFirestoreListenerError(
  error: unknown,
  fallback = "Unable to load realtime data.",
): FirestoreListenerError {
  const rawMessage = toMessage(error, fallback);
  const message = rawMessage.toLowerCase();

  const isMissingIndex =
    message.includes("failed_precondition") ||
    message.includes("requires an index");
  const isPermission =
    message.includes("missing or insufficient permissions") ||
    message.includes("permission-denied");
  const isTransientStorage =
    message.includes("indexed database server lost") ||
    message.includes("indexeddb") ||
    message.includes("failed to obtain persistence");

  let userMessage = rawMessage;
  if (isPermission) {
    userMessage = "You do not have permission to view this data.";
  } else if (isTransientStorage) {
    userMessage = "Realtime storage connection was interrupted. Refresh to retry.";
  } else if (message.includes("unavailable") || message.includes("offline")) {
    userMessage = "Realtime service is temporarily unavailable. We will retry automatically.";
  }

  return {
    rawMessage,
    userMessage,
    isMissingIndex,
    isPermission,
    isTransientStorage,
  };
}
