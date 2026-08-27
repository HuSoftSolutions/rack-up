import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import { loadUserIdentities } from "@/lib/server/user-identities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampLimit(value: string | null, fallback = 200) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(20, parsed), 1000);
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

export async function GET(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  try {
    await requireAdmin(request);
    const { eventId } = await context.params;
    if (!eventId) return NextResponse.json({ error: "eventId is required." }, { status: 400 });

    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get("limit"), 200);
    const userId = url.searchParams.get("userId")?.trim() ?? "";

    let query = adminFirestore
      .collection("scan_event_claim_events")
      .where("scanEventId", "==", eventId);
    if (userId) query = query.where("userId", "==", userId);

    const snap = await query.limit(limit).get();
    const rows = snap.docs
      .map((doc) => {
        const data = doc.data() as {
          scanEventId?: string;
          userId?: string;
          claimCount?: number;
          pointsAwarded?: number;
          giveawayEntriesAwarded?: number;
          giveawayAwardCount?: number;
          giveawayTargetMode?: string;
          giveawayIds?: string[];
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
          scanEventId: data.scanEventId ?? eventId,
          userId: data.userId ?? null,
          claimCount: typeof data.claimCount === "number" ? data.claimCount : 0,
          pointsAwarded: typeof data.pointsAwarded === "number" ? data.pointsAwarded : 0,
          giveawayEntriesAwarded:
            typeof data.giveawayEntriesAwarded === "number" ? data.giveawayEntriesAwarded : 0,
          giveawayAwardCount:
            typeof data.giveawayAwardCount === "number" ? data.giveawayAwardCount : 0,
          giveawayTargetMode: data.giveawayTargetMode ?? null,
          giveawayIds: Array.isArray(data.giveawayIds) ? data.giveawayIds : [],
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
      })
      .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));

    const userLookup = await loadUserIdentities(rows.map((row) => row.userId));
    const enrichedRows = rows.map((row) => {
      const user = row.userId ? userLookup.get(row.userId) : null;
      return {
        ...row,
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
    const message = err instanceof Error ? err.message : "Failed to load scan event activity.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
