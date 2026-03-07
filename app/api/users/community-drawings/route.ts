import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DrawingSummary = {
  id: string;
  title: string;
  status: "draft" | "active" | "closed" | "drawn";
  description: string;
  totalEntries: number;
  firstEntryAt: string | null;
  lastEntryAt: string | null;
  prize: {
    name?: string;
    value?: string;
    imageUrl?: string;
    description?: string;
  } | null;
  winner: {
    drawnAt?: string | null;
    donorName?: string | null;
    donorEmail?: string | null;
  } | null;
};

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

function parseStatus(value: unknown): DrawingSummary["status"] {
  return value === "active" || value === "closed" || value === "drawn" ? value : "draft";
}

export async function GET(request: Request) {
  try {
    const { uid } = await requireUser(request);

    const entriesSnap = await adminFirestore
      .collection("giveaway_entries")
      .where("userId", "==", uid)
      .limit(5000)
      .get();

    if (entriesSnap.empty) {
      return NextResponse.json({ drawings: [] as DrawingSummary[] });
    }

    const aggregates = new Map<
      string,
      { totalEntries: number; firstEntryAt: string | null; lastEntryAt: string | null }
    >();

    for (const doc of entriesSnap.docs) {
      const data = doc.data() as {
        giveawayId?: string;
        entriesCount?: number;
        createdAt?: unknown;
      };
      const giveawayId = data.giveawayId;
      if (!giveawayId) continue;
      const createdAt = toIso(data.createdAt);
      const entriesCount =
        typeof data.entriesCount === "number" && Number.isFinite(data.entriesCount) ? data.entriesCount : 0;

      const existing = aggregates.get(giveawayId);
      if (!existing) {
        aggregates.set(giveawayId, {
          totalEntries: entriesCount,
          firstEntryAt: createdAt,
          lastEntryAt: createdAt,
        });
        continue;
      }

      existing.totalEntries += entriesCount;
      if (createdAt && (!existing.firstEntryAt || createdAt < existing.firstEntryAt)) {
        existing.firstEntryAt = createdAt;
      }
      if (createdAt && (!existing.lastEntryAt || createdAt > existing.lastEntryAt)) {
        existing.lastEntryAt = createdAt;
      }
    }

    const giveawayIds = Array.from(aggregates.keys());
    const giveawayDocs = await Promise.all(
      giveawayIds.map((id) => adminFirestore.collection("giveaways").doc(id).get()),
    );

    const drawings = giveawayDocs
      .filter((doc) => doc.exists)
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const aggregate = aggregates.get(doc.id) ?? {
          totalEntries: 0,
          firstEntryAt: null,
          lastEntryAt: null,
        };
        const prizeRaw =
          data.prize && typeof data.prize === "object"
            ? (data.prize as Record<string, unknown>)
            : null;
        const winnerRaw =
          data.winner && typeof data.winner === "object"
            ? (data.winner as Record<string, unknown>)
            : null;

        return {
          id: doc.id,
          title: typeof data.title === "string" ? data.title : doc.id,
          status: parseStatus(data.status),
          description: typeof data.description === "string" ? data.description : "",
          totalEntries: aggregate.totalEntries,
          firstEntryAt: aggregate.firstEntryAt,
          lastEntryAt: aggregate.lastEntryAt,
          prize: prizeRaw
            ? {
                name: typeof prizeRaw.name === "string" ? prizeRaw.name : undefined,
                value: typeof prizeRaw.value === "string" ? prizeRaw.value : undefined,
                imageUrl: typeof prizeRaw.imageUrl === "string" ? prizeRaw.imageUrl : undefined,
                description: typeof prizeRaw.description === "string" ? prizeRaw.description : undefined,
              }
            : null,
          winner: winnerRaw
            ? {
                drawnAt: toIso(winnerRaw.drawnAt),
                donorName: typeof winnerRaw.donorName === "string" ? winnerRaw.donorName : null,
                donorEmail: typeof winnerRaw.donorEmail === "string" ? winnerRaw.donorEmail : null,
              }
            : null,
        } satisfies DrawingSummary;
      })
      .sort((a, b) => {
        const aLast = a.lastEntryAt ? Date.parse(a.lastEntryAt) : 0;
        const bLast = b.lastEntryAt ? Date.parse(b.lastEntryAt) : 0;
        return bLast - aLast;
      });

    return NextResponse.json({ drawings });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Failed to load community drawings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
