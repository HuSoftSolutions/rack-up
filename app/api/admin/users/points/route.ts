import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import { normalizeGiveawayEntryConfig } from "@/lib/server/giveaway-entry-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  userId?: string;
  pointsDelta?: number;
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
    const pointsDelta = typeof body.pointsDelta === "number" ? body.pointsDelta : NaN;
    const reason = body.reason?.trim();

    if (!userId) return badRequest("userId is required.");
    if (!Number.isFinite(pointsDelta) || pointsDelta === 0) {
      return badRequest("pointsDelta must be a non-zero number.");
    }
    if (!reason) return badRequest("reason is required.");

    const now = Timestamp.now();
    const txRef = adminFirestore.collection("transactions").doc();
    const entriesByGiveawayId: Record<string, number> = {};
    let totalEntries = 0;

    await adminFirestore.runTransaction(async (tx) => {
      const activeGiveawaysSnap =
        pointsDelta > 0
          ? await tx.get(
              adminFirestore.collection("giveaways").where("status", "==", "active"),
            )
          : null;

      if (pointsDelta > 0 && activeGiveawaysSnap && !activeGiveawaysSnap.empty) {
        const safePoints = Math.floor(Math.max(0, pointsDelta));

        for (const giveawayDoc of activeGiveawaysSnap.docs) {
          const giveawayId = giveawayDoc.id;
          const balanceRef = adminFirestore
            .collection("giveaway_point_balances")
            .doc(`${giveawayId}_${userId}`);
          const balanceSnap = await tx.get(balanceRef);
          const balanceData = balanceSnap.data() as
            | {
                remainingPoints?: number;
                totalPointsProcessed?: number;
                totalEntriesAwarded?: number;
              }
            | undefined;
          const carryInRaw = balanceData?.remainingPoints;
          const carryIn =
            typeof carryInRaw === "number" && carryInRaw > 0 ? Math.floor(carryInRaw) : 0;
          const giveawayData = giveawayDoc.data() as { entryConfig?: unknown };
          const entryConfig = normalizeGiveawayEntryConfig(giveawayData.entryConfig);
          const entryUnit = entryConfig.entryUnitPoints;
          const entryMultiplier = 1; // manual point adjustments do not have a scan source
          const totalPointsForEntry = carryIn + safePoints;
          const baseEntries = Math.floor(totalPointsForEntry / entryUnit);
          const entriesCount = baseEntries * entryMultiplier;
          const carryOut = totalPointsForEntry % entryUnit;
          entriesByGiveawayId[giveawayId] = entriesCount;
          totalEntries += entriesCount;

          tx.set(
            balanceRef,
            {
              giveawayId,
              userId,
              remainingPoints: carryOut,
              totalPointsProcessed: (balanceData?.totalPointsProcessed ?? 0) + safePoints,
              totalEntriesAwarded: (balanceData?.totalEntriesAwarded ?? 0) + entriesCount,
              lastAdjustmentTransactionId: txRef.id,
              updatedAt: now,
            },
            { merge: true },
          );

          const entryRef = adminFirestore
            .collection("giveaway_entries")
            .doc(`${giveawayId}_adjustment_${txRef.id}`);
          tx.set(entryRef, {
            giveawayId,
            donationId: null,
            userId,
            entriesCount,
            pointsApplied: safePoints,
            pointsCarryIn: carryIn,
            pointsCarryOut: carryOut,
            entryUnitPoints: entryUnit,
            entryMultiplier,
            scanSource: "admin_adjustment",
            amountCents: null,
            sourceType: "admin_adjustment",
            adjustmentTransactionId: txRef.id,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      tx.set(txRef, {
        type: "adjustment",
        status: "completed",
        pointsDelta,
        userId,
        adminId: admin.uid,
        reason,
        giveawayEntries: pointsDelta > 0 ? totalEntries : 0,
        giveawayCapture:
          pointsDelta > 0
            ? {
                sourceType: "admin_adjustment",
                entryUnitPoints: null,
                entriesByGiveawayId,
                totalEntriesAcrossGiveaways: totalEntries,
              }
            : null,
        createdAt: now,
      });
    });

    return NextResponse.json({
      ok: true,
      id: txRef.id,
      giveawayEntries: pointsDelta > 0 ? totalEntries : 0,
      entriesByGiveawayId,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to adjust points." }, { status: 500 });
  }
}
