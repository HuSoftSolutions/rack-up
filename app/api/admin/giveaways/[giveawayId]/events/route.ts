import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === "object" && value !== null && "_seconds" in value) {
    const ts = value as { _seconds: number; _nanoseconds?: number };
    return new Date(ts._seconds * 1000 + Math.floor((ts._nanoseconds ?? 0) / 1_000_000)).toISOString();
  }
  return null;
}

function clampLimit(value: string | null, fallback = 200) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(20, parsed), 1000);
}

export async function GET(request: Request, context: { params: Promise<{ giveawayId: string }> }) {
  try {
    await requireAdmin(request);
    const { giveawayId } = await context.params;
    if (!giveawayId) {
      return NextResponse.json({ error: "giveawayId is required." }, { status: 400 });
    }
    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get("limit"), 200);

    const snap = await adminFirestore
      .collection("giveaway_events")
      .where("giveawayId", "==", giveawayId)
      .limit(limit)
      .get();

    const events = snap.docs
      .map((doc) => {
        const data = doc.data() as {
          giveawayId?: string;
          type?: string;
          actorUserId?: string;
          at?: unknown;
          payload?: unknown;
        };
        return {
          id: doc.id,
          giveawayId: data.giveawayId ?? giveawayId,
          type: data.type ?? "unknown",
          actorUserId: data.actorUserId ?? null,
          at: toIso(data.at),
          payload: data.payload ?? null,
        };
      })
      .sort((a, b) => {
        const left = a.at ? Date.parse(a.at) : 0;
        const right = b.at ? Date.parse(b.at) : 0;
        return right - left;
      });

    return NextResponse.json({ events });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to load giveaway history.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
