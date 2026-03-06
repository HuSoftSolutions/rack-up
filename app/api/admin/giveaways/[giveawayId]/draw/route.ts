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
    const giveaway = giveawaySnap.data() as { status?: string; winner?: unknown };
    if (giveaway.status === "drawn" || giveaway.winner) {
      return NextResponse.json({ error: "Winner already drawn." }, { status: 400 });
    }
    if (giveaway.status !== "active" && giveaway.status !== "closed") {
      return NextResponse.json({ error: "Community drawing must be active or closed to draw." }, { status: 400 });
    }

    const entriesSnap = await adminFirestore
      .collection("giveaway_entries")
      .where("giveawayId", "==", giveawayId)
      .get();
    const entries: Entry[] = entriesSnap.docs.map((doc) => {
      const data = doc.data() as { userId?: string; donationId?: string | null; entriesCount?: number };
      return {
        id: doc.id,
        userId: data.userId ?? "",
        donationId: data.donationId ?? null,
        entriesCount: data.entriesCount ?? 0,
      };
    }).filter((entry) => Boolean(entry.userId) && entry.entriesCount > 0);

    const winner = pickWeighted(entries);
    if (!winner) {
      return NextResponse.json({ error: "No entries available to draw." }, { status: 400 });
    }

    let winnerDonation: {
      donorName?: string | null;
      donorEmail?: string | null;
      amountCents?: number | null;
      causeTitle?: string | null;
    } | null = null;
    if (winner.donationId) {
      const winnerDonationSnap = await adminFirestore.collection("donations").doc(winner.donationId).get();
      winnerDonation = winnerDonationSnap.exists
        ? (winnerDonationSnap.data() as {
            donorName?: string | null;
            donorEmail?: string | null;
            amountCents?: number | null;
            causeTitle?: string | null;
          })
        : null;
    }
    const winnerUserSnap = await adminFirestore.collection("users").doc(winner.userId).get();
    const winnerUserData = winnerUserSnap.exists
      ? (winnerUserSnap.data() as { phoneNumber?: string | null })
      : null;
    const now = Timestamp.now();

    await giveawayRef.set(
      {
        status: "drawn",
        winner: {
          userId: winner.userId,
          entryId: winner.id,
          donationId: winner.donationId ?? null,
          donorName: winnerDonation?.donorName ?? null,
          donorEmail: winnerDonation?.donorEmail ?? null,
          phoneNumber: winnerUserData?.phoneNumber ?? null,
          amountCents: winnerDonation?.amountCents ?? null,
          causeTitle: winnerDonation?.causeTitle ?? null,
          drawnAt: now,
        },
        updatedAt: now,
      },
      { merge: true },
    );

    await adminFirestore.collection("giveaway_events").add({
      giveawayId,
      type: "winner_drawn",
      actorUserId: admin.uid,
      at: now,
      payload: {
        winnerUserId: winner.userId,
        winnerEntryId: winner.id,
        winnerDonationId: winner.donationId ?? null,
        winnerPhoneNumber: winnerUserData?.phoneNumber ?? null,
        entriesConsidered: entries.length,
        totalWeight: entries.reduce((sum, entry) => sum + entry.entriesCount, 0),
      },
    });

    return NextResponse.json({
      ok: true,
      winner: {
        ...winner,
        donorName: winnerDonation?.donorName ?? null,
        donorEmail: winnerDonation?.donorEmail ?? null,
        phoneNumber: winnerUserData?.phoneNumber ?? null,
        amountCents: winnerDonation?.amountCents ?? null,
        causeTitle: winnerDonation?.causeTitle ?? null,
        drawnAt: now.toDate().toISOString(),
      },
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
