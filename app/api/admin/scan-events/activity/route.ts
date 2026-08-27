import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import { loadUserIdentities } from "@/lib/server/user-identities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampLimit(value: string | null, fallback = 300) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(50, parsed), 1500);
}

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

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get("limit"), 300);

    const snap = await adminFirestore
      .collection("scan_event_claim_events")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const rows = snap.docs.map((doc) => {
      const data = doc.data() as {
        scanEventId?: string;
        userId?: string;
        claimCount?: number;
        pointsAwarded?: number;
        giveawayEntriesAwarded?: number;
        giveawayAwardCount?: number;
        proximity?: {
          mode?: string;
          distanceMeters?: number | null;
          verified?: boolean | null;
          failureReason?: string | null;
        } | null;
        createdAt?: unknown;
      };
      return {
        id: doc.id,
        scanEventId: data.scanEventId ?? null,
        userId: data.userId ?? null,
        claimCount: typeof data.claimCount === "number" ? data.claimCount : 0,
        pointsAwarded: typeof data.pointsAwarded === "number" ? data.pointsAwarded : 0,
        giveawayEntriesAwarded:
          typeof data.giveawayEntriesAwarded === "number" ? data.giveawayEntriesAwarded : 0,
        giveawayAwardCount: typeof data.giveawayAwardCount === "number" ? data.giveawayAwardCount : 0,
        proximity: data.proximity
          ? {
              mode: data.proximity.mode ?? "off",
              distanceMeters:
                typeof data.proximity.distanceMeters === "number" ? data.proximity.distanceMeters : null,
              verified:
                typeof data.proximity.verified === "boolean" ? data.proximity.verified : null,
              failureReason: data.proximity.failureReason ?? null,
            }
          : null,
        createdAt: toIso(data.createdAt),
      };
    });

    const eventIds = Array.from(new Set(rows.map((row) => row.scanEventId).filter((id): id is string => Boolean(id))));
    const eventTitleById = new Map<string, string>();
    for (let i = 0; i < eventIds.length; i += 300) {
      const batch = eventIds.slice(i, i + 300);
      const refs = batch.map((id) => adminFirestore.collection("scan_events").doc(id));
      if (refs.length === 0) continue;
      const eventSnaps = await adminFirestore.getAll(...refs);
      eventSnaps.forEach((eventSnap) => {
        const data = eventSnap.data() as { title?: string } | undefined;
        eventTitleById.set(eventSnap.id, data?.title ?? eventSnap.id);
      });
    }

    const userLookup = await loadUserIdentities(rows.map((row) => row.userId));
    const enrichedRows = rows.map((row) => {
      const user = row.userId ? userLookup.get(row.userId) : null;
      return {
        ...row,
        scanEventTitle: row.scanEventId ? eventTitleById.get(row.scanEventId) ?? row.scanEventId : "Unknown event",
        userDisplayName: user?.displayName ?? null,
        userEmail: user?.email ?? null,
        userPhoneNumber: user?.phoneNumber ?? null,
      };
    });

    return NextResponse.json({ rows: enrichedRows, truncated: snap.size >= limit });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to load scan engagement activity.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
