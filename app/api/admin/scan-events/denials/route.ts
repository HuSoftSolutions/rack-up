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

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Members turned away by the geofence. Unlike claims, a denial produces no
 * reward and no claim event, so this is the only record of how far off a real
 * on-site fix actually landed — the input for tuning an event's radius.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get("limit"), 200);
    const eventId = url.searchParams.get("eventId")?.trim() ?? "";

    // Filtering by event and ordering by time would need a composite index, so
    // scoped queries sort in memory (same approach as the per-event activity route).
    const collection = adminFirestore.collection("scan_event_location_denials");
    const snap = eventId
      ? await collection.where("scanEventId", "==", eventId).limit(limit).get()
      : await collection.orderBy("createdAt", "desc").limit(limit).get();

    const rows = snap.docs
      .map((doc) => {
        const data = doc.data() as {
          scanEventId?: string;
          userId?: string;
          stage?: string;
          outcome?: string;
          mode?: string;
          distanceMeters?: unknown;
          accuracyMeters?: unknown;
          radiusMeters?: unknown;
          allowanceMeters?: unknown;
          createdAt?: unknown;
        };
        return {
          id: doc.id,
          scanEventId: data.scanEventId ?? eventId ?? null,
          userId: data.userId ?? null,
          stage: data.stage ?? "verify",
          outcome: data.outcome ?? null,
          mode: data.mode ?? "enforce",
          distanceMeters: asNumberOrNull(data.distanceMeters),
          accuracyMeters: asNumberOrNull(data.accuracyMeters),
          radiusMeters: asNumberOrNull(data.radiusMeters),
          allowanceMeters: asNumberOrNull(data.allowanceMeters),
          createdAt: toIso(data.createdAt),
        };
      })
      .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));

    const eventIds = Array.from(
      new Set(rows.map((row) => row.scanEventId).filter((id): id is string => Boolean(id))),
    );
    const eventTitleById = new Map<string, string>();
    for (let i = 0; i < eventIds.length; i += 300) {
      const refs = eventIds
        .slice(i, i + 300)
        .map((id) => adminFirestore.collection("scan_events").doc(id));
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
        scanEventTitle: row.scanEventId
          ? eventTitleById.get(row.scanEventId) ?? row.scanEventId
          : "Unknown event",
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
    const message = err instanceof Error ? err.message : "Failed to load location denials.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
