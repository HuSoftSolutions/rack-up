import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const giveaway = giveawaySnap.data() as { status?: string; winner?: unknown; winners?: unknown };
    const existingWinners = Array.isArray(giveaway.winners)
      ? (giveaway.winners as WinnerRecord[])
      : giveaway.winner && typeof giveaway.winner === "object"
        ? [giveaway.winner as WinnerRecord]
        : [];

    const now = Timestamp.now();
    await giveawayRef.set(
      {
        winner: null,
        winners: [],
        status: giveaway.status === "drawn" ? "closed" : giveaway.status ?? "draft",
        updatedAt: now,
      },
      { merge: true },
    );

    await adminFirestore.collection("giveaway_events").add({
      giveawayId,
      type: "winners_reset",
      actorUserId: admin.uid,
      at: now,
      payload: {
        clearedWinnerCount: existingWinners.length,
      },
    });

    return NextResponse.json({
      ok: true,
      clearedWinnerCount: existingWinners.length,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to reset community drawing winners." }, { status: 500 });
  }
}
