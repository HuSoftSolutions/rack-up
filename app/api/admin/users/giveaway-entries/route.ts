import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import { normalizeGiveawayEntryConfig } from "@/lib/server/giveaway-entry-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  userId?: string;
  giveawayIds?: string[];
  entriesCount?: number;
  reason?: string;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const userId = body.userId?.trim();
    const giveawayIds = Array.isArray(body.giveawayIds)
      ? Array.from(new Set(body.giveawayIds.map((value) => value.trim()).filter(Boolean)))
      : [];
    const entriesCountRaw = body.entriesCount;
    const entriesCount = typeof entriesCountRaw === "number" ? Math.floor(entriesCountRaw) : NaN;
    const reason = body.reason?.trim();

    if (!userId) return badRequest("userId is required.");
    if (giveawayIds.length === 0) return badRequest("At least one community drawing is required.");
    if (!Number.isFinite(entriesCount) || entriesCount <= 0) {
      return badRequest("entriesCount must be a positive whole number.");
    }
    if (!reason) return badRequest("reason is required.");

    const now = Timestamp.now();
    const granted: Array<{ giveawayId: string; entryId: string; entriesCount: number }> = [];

    await adminFirestore.runTransaction(async (tx) => {
      for (const giveawayId of giveawayIds) {
        const giveawayRef = adminFirestore.collection("giveaways").doc(giveawayId);
        const giveawaySnap = await tx.get(giveawayRef);
        if (!giveawaySnap.exists) {
          throw new Error(`Community drawing not found: ${giveawayId}`);
        }
        const giveawayData = giveawaySnap.data() as { status?: string; title?: string } | undefined;
        const status = giveawayData?.status ?? "draft";
        if (status !== "active" && status !== "closed") {
          throw new Error(`Community drawing ${giveawayId} must be active or closed.`);
        }
        const entryConfig = normalizeGiveawayEntryConfig(
          (giveawayData as { entryConfig?: unknown } | undefined)?.entryConfig,
        );

        const entryRef = adminFirestore.collection("giveaway_entries").doc();
        tx.set(entryRef, {
          giveawayId,
          donationId: null,
          userId,
          entriesCount,
          pointsApplied: null,
          pointsCarryIn: null,
          pointsCarryOut: null,
          entryUnitPoints: entryConfig.entryUnitPoints,
          entryMultiplier: null,
          scanSource: "admin_manual_entry",
          amountCents: null,
          sourceType: "admin_manual_entry",
          manualReason: reason,
          adminId: admin.uid,
          createdAt: now,
          updatedAt: now,
        });

        const eventRef = adminFirestore.collection("giveaway_events").doc();
        tx.set(eventRef, {
          giveawayId,
          type: "manual_entries_granted",
          actorUserId: admin.uid,
          at: now,
          payload: {
            userId,
            entryId: entryRef.id,
            entriesCount,
            reason,
          },
        });

        granted.push({ giveawayId, entryId: entryRef.id, entriesCount });
      }
    });

    return NextResponse.json({
      ok: true,
      userId,
      grantedCount: granted.length,
      entriesGranted: granted,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to grant manual community drawing entries.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
