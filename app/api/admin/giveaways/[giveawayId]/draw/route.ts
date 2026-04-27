import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Entry = {
  id: string;
  userId: string;
  donationId: string | null;
  entriesCount: number;
};

type WinnerRecord = {
  userId?: string | null;
  entryId?: string | null;
  donationId?: string | null;
  donorName?: string | null;
  donorEmail?: string | null;
  phoneNumber?: string | null;
  amountCents?: number | null;
  causeTitle?: string | null;
  drawnAt?: unknown;
};

type DrawRequestBody = {
  mode?: "draw" | "repick";
  winnerIndex?: unknown;
};

function normalizeWinnerCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
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

function pickWeighted(entries: Entry[]): Entry | null {
  const total = entries.reduce((sum, e) => sum + (e.entriesCount || 0), 0);
  if (total <= 0) return null;
  let roll = Math.floor(Math.random() * total) + 1;
  for (const entry of entries) {
    roll -= entry.entriesCount || 0;
    if (roll <= 0) return entry;
  }
  return null;
}

function getConsumedTicketCounts(winners: WinnerRecord[]): Map<string, number> {
  const consumed = new Map<string, number>();
  for (const winner of winners) {
    const entryId = typeof winner.entryId === "string" ? winner.entryId : null;
    if (!entryId) continue;
    consumed.set(entryId, (consumed.get(entryId) ?? 0) + 1);
  }
  return consumed;
}

function getAvailableEntries(entries: Entry[], consumedTicketCounts: Map<string, number>): Entry[] {
  return entries
    .map((entry) => {
      const consumed = consumedTicketCounts.get(entry.id) ?? 0;
      const remaining = Math.max(0, entry.entriesCount - consumed);
      return remaining > 0
        ? {
            ...entry,
            entriesCount: remaining,
          }
        : null;
    })
    .filter((entry): entry is Entry => Boolean(entry));
}

async function buildWinnerRecord(entry: Entry, drawnAt: Timestamp): Promise<WinnerRecord> {
  let winnerDonation: {
    donorName?: string | null;
    donorEmail?: string | null;
    amountCents?: number | null;
    causeTitle?: string | null;
  } | null = null;
  if (entry.donationId) {
    const winnerDonationSnap = await adminFirestore.collection("donations").doc(entry.donationId).get();
    winnerDonation = winnerDonationSnap.exists
      ? (winnerDonationSnap.data() as {
          donorName?: string | null;
          donorEmail?: string | null;
          amountCents?: number | null;
          causeTitle?: string | null;
        })
      : null;
  }

  const winnerUserSnap = await adminFirestore.collection("users").doc(entry.userId).get();
  const winnerUserData = winnerUserSnap.exists
    ? (winnerUserSnap.data() as {
        fullName?: string | null;
        displayName?: string | null;
        email?: string | null;
        phoneNumber?: string | null;
      })
    : null;
  const userFullName = winnerUserData?.fullName ?? winnerUserData?.displayName ?? null;

  return {
    userId: entry.userId,
    entryId: entry.id,
    donationId: entry.donationId ?? null,
    donorName: winnerDonation?.donorName ?? userFullName,
    donorEmail: winnerDonation?.donorEmail ?? winnerUserData?.email ?? null,
    phoneNumber: winnerUserData?.phoneNumber ?? null,
    amountCents: winnerDonation?.amountCents ?? null,
    causeTitle: winnerDonation?.causeTitle ?? null,
    drawnAt,
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ giveawayId: string }> },
) {
  try {
    const admin = await requireAdmin(request);
    const { giveawayId } = await context.params;
    const giveawayRef = adminFirestore.collection("giveaways").doc(giveawayId);
    const giveawaySnap = await giveawayRef.get();
    if (!giveawaySnap.exists) {
      return NextResponse.json({ error: "Community drawing not found." }, { status: 404 });
    }
    const giveaway = giveawaySnap.data() as {
      status?: string;
      winner?: unknown;
      winners?: unknown;
      winnerCount?: unknown;
    };
    if (giveaway.status !== "active" && giveaway.status !== "closed" && giveaway.status !== "drawn") {
      return NextResponse.json(
        { error: "Community drawing must be active, closed, or drawn to draw." },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as DrawRequestBody;
    const mode: "draw" | "repick" = body.mode === "repick" ? "repick" : "draw";
    const winnerCount = normalizeWinnerCount(giveaway.winnerCount);

    const existingWinnersRaw = Array.isArray(giveaway.winners)
      ? (giveaway.winners as WinnerRecord[])
      : giveaway.winner && typeof giveaway.winner === "object"
        ? [giveaway.winner as WinnerRecord]
        : [];

    const entriesSnap = await adminFirestore
      .collection("giveaway_entries")
      .where("giveawayId", "==", giveawayId)
      .get();
    const entries: Entry[] = entriesSnap.docs
      .map((doc) => {
        const data = doc.data() as { userId?: string; donationId?: string | null; entriesCount?: number };
        return {
          id: doc.id,
          userId: data.userId ?? "",
          donationId: data.donationId ?? null,
          entriesCount: data.entriesCount ?? 0,
        };
      })
      .filter(
        (entry) =>
          Boolean(entry.userId) &&
          entry.entriesCount > 0,
      );

    const now = Timestamp.now();
    const winners = [...existingWinnersRaw];
    const winnerActions: Array<{
      winner: Entry;
      winnerRecord: WinnerRecord;
      winnerIndex: number;
      repick: boolean;
      entriesConsidered: number;
      totalWeight: number;
    }> = [];

    if (mode === "repick") {
      const winnerIndex = Number.isFinite(Number(body.winnerIndex))
        ? Math.floor(Number(body.winnerIndex))
        : -1;
      if (winnerIndex < 0 || winnerIndex >= winners.length) {
        return NextResponse.json({ error: "A valid winner index is required to repick." }, { status: 400 });
      }
      const winnersExcludingSlot = winners.filter((_, index) => index !== winnerIndex);
      const consumedTicketCounts = getConsumedTicketCounts(winnersExcludingSlot);
      const currentWinnerEntryId =
        typeof winners[winnerIndex]?.entryId === "string" ? (winners[winnerIndex]?.entryId as string) : null;
      let eligibleEntries = getAvailableEntries(entries, consumedTicketCounts).filter(
        (entry) => entry.id !== currentWinnerEntryId,
      );
      if (eligibleEntries.length === 0) {
        eligibleEntries = getAvailableEntries(entries, consumedTicketCounts);
      }
      const totalWeight = eligibleEntries.reduce((sum, entry) => sum + entry.entriesCount, 0);
      const selectedWinner = pickWeighted(eligibleEntries);
      if (!selectedWinner) {
        return NextResponse.json(
          { error: "No eligible entries available to repick this winner slot." },
          { status: 400 },
        );
      }
      const winnerRecord = await buildWinnerRecord(selectedWinner, now);
      winners[winnerIndex] = winnerRecord;
      winnerActions.push({
        winner: selectedWinner,
        winnerRecord,
        winnerIndex,
        repick: true,
        entriesConsidered: eligibleEntries.length,
        totalWeight,
      });
    } else {
      if (winners.length >= winnerCount) {
        return NextResponse.json(
          { error: "All winner slots have already been drawn for this community drawing." },
          { status: 400 },
        );
      }

      while (winners.length < winnerCount) {
        const consumedTicketCounts = getConsumedTicketCounts(winners);
        const eligibleEntries = getAvailableEntries(entries, consumedTicketCounts);
        const totalWeight = eligibleEntries.reduce((sum, entry) => sum + entry.entriesCount, 0);
        const selectedWinner = pickWeighted(eligibleEntries);
        if (!selectedWinner) break;
        const winnerRecord = await buildWinnerRecord(selectedWinner, now);
        const winnerIndex = winners.length;
        winners.push(winnerRecord);
        winnerActions.push({
          winner: selectedWinner,
          winnerRecord,
          winnerIndex,
          repick: false,
          entriesConsidered: eligibleEntries.length,
          totalWeight,
        });
      }

      if (winnerActions.length === 0) {
        return NextResponse.json(
          { error: "No eligible entries available to draw (all entrants may already be winners)." },
          { status: 400 },
        );
      }
    }

    const latestWinner = winners[winners.length - 1] ?? null;
    const resolvedStatus = winners.length >= winnerCount ? "drawn" : giveaway.status ?? "active";

    await giveawayRef.set(
      {
        status: resolvedStatus,
        winner: latestWinner,
        winners,
        updatedAt: now,
      },
      { merge: true },
    );

    await Promise.all(
      winnerActions.map((action) =>
        adminFirestore.collection("giveaway_events").add({
          giveawayId,
          type: "winner_drawn",
          actorUserId: admin.uid,
          at: now,
          payload: {
            drawNumber: action.winnerIndex + 1,
            winnerIndex: action.winnerIndex,
            repick: action.repick,
            winnerUserId: action.winner.userId,
            winnerEntryId: action.winner.id,
            winnerDonationId: action.winner.donationId ?? null,
            winnerPhoneNumber: action.winnerRecord.phoneNumber ?? null,
            entriesConsidered: action.entriesConsidered,
            totalWeight: action.totalWeight,
          },
        }),
      ),
    );

    const latestAction = winnerActions[winnerActions.length - 1] ?? null;

    return NextResponse.json({
      ok: true,
      winnerCount,
      drawnNow: winnerActions.length,
      winnersDrawn: winners.length,
      winner: latestAction
        ? {
            ...latestAction.winnerRecord,
            drawNumber: latestAction.winnerIndex + 1,
            winnerIndex: latestAction.winnerIndex,
            drawnAt: toIso(latestAction.winnerRecord.drawnAt),
          }
        : null,
      winners: winners.map((winnerRecord, index) => ({
        ...winnerRecord,
        drawNumber: index + 1,
        winnerIndex: index,
        drawnAt: toIso(winnerRecord.drawnAt),
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to draw winner." }, { status: 500 });
  }
}
