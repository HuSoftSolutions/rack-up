import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import { createScanEventToken, normalizeScanEventInput } from "@/lib/server/scan-events";
import type { ScanEventDoc } from "@/lib/types/scan-event";

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

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const [eventsSnap, causesSnap, businessesSnap, giveawaysSnap] = await Promise.all([
      adminFirestore.collection("scan_events").orderBy("createdAt", "desc").get(),
      adminFirestore.collection("causes").where("active", "==", true).get(),
      adminFirestore.collection("businesses").where("active", "==", true).get(),
      adminFirestore.collection("giveaways").where("status", "in", ["draft", "active"]).get(),
    ]);

    const events = eventsSnap.docs.map((doc) => {
      const data = doc.data() as ScanEventDoc;
      const token = createScanEventToken(doc.id);
      const giveawayRaw = data.rewards?.giveaway as
        | { enabled?: boolean; targetMode?: string; giveawayIds?: string[]; giveawayId?: string; entries?: number }
        | undefined;
      const normalizedGiveawayIds = Array.isArray(giveawayRaw?.giveawayIds)
        ? giveawayRaw?.giveawayIds
        : giveawayRaw?.giveawayId
          ? [giveawayRaw.giveawayId]
          : [];
      return {
        id: doc.id,
        title: data.title,
        description: data.description ?? "",
        active: data.active !== false,
        place: data.place ?? null,
        proximity: data.proximity ?? null,
        association: data.association,
        cadence: data.cadence,
        rewards: {
          points: data.rewards.points,
          giveaway: {
            enabled: data.rewards.giveaway.enabled,
            targetMode: giveawayRaw?.targetMode === "all_active" ? "all_active" : "selected",
            giveawayIds: normalizedGiveawayIds,
            entries: data.rewards.giveaway.entries,
          },
        },
        imageUrl: data.imageUrl ?? null,
        imagePath: data.imagePath ?? null,
        token,
        scanPath: `/s/${token}`,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });

    const businesses = await Promise.all(
      businessesSnap.docs.map(async (doc) => {
        const data = doc.data() as { name?: string };
        const locationsSnap = await doc.ref.collection("locations").where("active", "==", true).get();
        return {
          id: doc.id,
          name: data.name ?? doc.id,
          locations: locationsSnap.docs.map((loc) => {
            const locData = loc.data() as { name?: string };
            return { id: loc.id, name: locData.name ?? loc.id };
          }),
        };
      }),
    );

    const causes = causesSnap.docs.map((doc) => {
      const data = doc.data() as { title?: string };
      return { id: doc.id, title: data.title ?? doc.id };
    });

    const giveaways = giveawaysSnap.docs.map((doc) => {
      const data = doc.data() as { title?: string; status?: string };
      return {
        id: doc.id,
        title: data.title ?? doc.id,
        status: data.status ?? "draft",
      };
    });

    return NextResponse.json({ events, causes, businesses, giveaways });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to load scan events.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const normalized = normalizeScanEventInput(body);
    const now = Timestamp.now();
    const ref = adminFirestore.collection("scan_events").doc();
    await ref.set({
      ...normalized,
      createdAt: now,
      updatedAt: now,
    } satisfies ScanEventDoc);

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to create scan event.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
