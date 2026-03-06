import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
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

function clampLimit(value: string | null, fallback = 500) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(50, parsed), 5000);
}

export async function GET(request: Request, context: { params: Promise<{ giveawayId: string }> }) {
  try {
    await requireAdmin(request);
    const { giveawayId } = await context.params;
    if (!giveawayId) {
      return NextResponse.json({ error: "Community drawing ID is required." }, { status: 400 });
    }
    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get("limit"), 500);
    const scanSource = url.searchParams.get("scanSource");

    const query = adminFirestore
      .collection("giveaway_entries")
      .where("giveawayId", "==", giveawayId);
    const snap = await query.limit(limit).get();

    const rows = snap.docs.map((doc) => {
      const data = doc.data() as {
        giveawayId?: string;
        donationId?: string;
        userId?: string;
        entriesCount?: number;
        scanSource?: string;
        amountCents?: number;
        createdAt?: Timestamp;
      };
      return {
        id: doc.id,
        giveawayId: data.giveawayId ?? giveawayId,
        donationId: data.donationId ?? null,
        userId: data.userId ?? null,
        entriesCount: data.entriesCount ?? 0,
        scanSource: data.scanSource ?? null,
        amountCents: data.amountCents ?? null,
        createdAt: toIso(data.createdAt),
      };
    });

    const withEntries = rows.filter((row) => (row.entriesCount ?? 0) > 0);
    const filtered =
      scanSource === "in_person" || scanSource === "remote"
        ? withEntries.filter((row) => row.scanSource === scanSource)
        : withEntries;
    filtered.sort((a, b) => {
      const left = a.createdAt ? Date.parse(a.createdAt) : 0;
      const right = b.createdAt ? Date.parse(b.createdAt) : 0;
      return right - left;
    });

    const totalEntries = filtered.reduce((sum, row) => sum + (row.entriesCount ?? 0), 0);
    return NextResponse.json({ entries: filtered, totalEntries });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Failed to load entries.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
