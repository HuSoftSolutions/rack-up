import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ErrorLogRow = {
  message: string;
  kind: string | null;
  name: string | null;
  path: string | null;
  createdAt: unknown;
  createdServerAt: unknown;
};

type Aggregate = {
  message: string;
  count: number;
  chunkLikeCount: number;
  kinds: Set<string>;
  names: Set<string>;
  lastSeenMs: number;
  samplePaths: Map<string, number>;
};

function looksLikeChunkError(message: string) {
  const value = message.toLowerCase();
  return (
    value.includes("chunkloaderror") ||
    value.includes("loading chunk") ||
    value.includes("failed to fetch dynamically imported module")
  );
}

function toMs(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof value === "object" && value !== null && "_seconds" in value) {
    const ts = value as { _seconds: number; _nanoseconds?: number };
    return ts._seconds * 1000 + Math.floor((ts._nanoseconds ?? 0) / 1_000_000);
  }
  return 0;
}

function clampInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const days = clampInt(url.searchParams.get("days"), 7, 1, 30);
    const scanLimit = clampInt(url.searchParams.get("scanLimit"), 4000, 500, 10000);
    const top = clampInt(url.searchParams.get("top"), 20, 5, 100);

    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sinceTs = Timestamp.fromDate(sinceDate);

    const snap = await adminFirestore
      .collection("client_error_logs")
      .where("createdAt", ">=", sinceTs)
      .orderBy("createdAt", "desc")
      .limit(scanLimit)
      .get();

    const aggregate = new Map<string, Aggregate>();
    let chunkLikeTotal = 0;

    snap.docs.forEach((doc) => {
      const data = doc.data() as ErrorLogRow;
      const message = typeof data.message === "string" ? data.message.trim() : "";
      if (!message) return;
      const isChunk = looksLikeChunkError(message);
      if (isChunk) chunkLikeTotal += 1;

      const existing = aggregate.get(message) ?? {
        message,
        count: 0,
        chunkLikeCount: 0,
        kinds: new Set<string>(),
        names: new Set<string>(),
        lastSeenMs: 0,
        samplePaths: new Map<string, number>(),
      };

      existing.count += 1;
      if (isChunk) existing.chunkLikeCount += 1;
      if (typeof data.kind === "string" && data.kind.trim()) existing.kinds.add(data.kind.trim());
      if (typeof data.name === "string" && data.name.trim()) existing.names.add(data.name.trim());
      const path = typeof data.path === "string" ? data.path.trim() : "";
      if (path) existing.samplePaths.set(path, (existing.samplePaths.get(path) ?? 0) + 1);
      const rowMs = Math.max(toMs(data.createdAt), toMs(data.createdServerAt));
      if (rowMs > existing.lastSeenMs) existing.lastSeenMs = rowMs;
      aggregate.set(message, existing);
    });

    const topMessages = Array.from(aggregate.values())
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.lastSeenMs - a.lastSeenMs;
      })
      .slice(0, top)
      .map((item) => ({
        message: item.message,
        count: item.count,
        chunkLikeCount: item.chunkLikeCount,
        kinds: Array.from(item.kinds).sort(),
        names: Array.from(item.names).sort(),
        lastSeenAt: item.lastSeenMs > 0 ? new Date(item.lastSeenMs).toISOString() : null,
        samplePaths: Array.from(item.samplePaths.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([path, count]) => ({ path, count })),
      }));

    return NextResponse.json({
      window: {
        days,
        since: sinceDate.toISOString(),
      },
      scannedLogs: snap.size,
      uniqueMessages: aggregate.size,
      chunkLikeTotal,
      topMessages,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Failed to summarize client errors.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
