import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import type { ScanEventDoc } from "@/lib/types/scan-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BackfillBody = {
  targetMode?: "selected" | "all_active";
  giveawayIds?: string[];
  entriesPerClaim?: number;
  updateScanEvent?: boolean;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  try {
    await requireAdmin(request);
    const { eventId } = await context.params;
    if (!eventId) return badRequest("eventId is required.");

    let body: BackfillBody;
    try {
      body = (await request.json()) as BackfillBody;
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const targetMode = body.targetMode === "all_active" ? "all_active" : "selected";
    const requestedIds = Array.from(
      new Set(
        Array.isArray(body.giveawayIds)
          ? body.giveawayIds.map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean)
          : [],
      ),
    );
    const entriesPerClaim = Math.max(
      1,
      Math.min(1000, Math.floor(Number(body.entriesPerClaim ?? 1))),
    );
    const updateScanEvent = body.updateScanEvent !== false;

    const eventRef = adminFirestore.collection("scan_events").doc(eventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) return badRequest("Scan event not found.");
    const eventData = eventSnap.data() as ScanEventDoc;

    let resolvedGiveawayIds: string[] = [];
    if (targetMode === "all_active") {
      const activeSnap = await adminFirestore
        .collection("giveaways")
        .where("status", "==", "active")
        .get();
      resolvedGiveawayIds = activeSnap.docs.map((doc) => doc.id);
      if (resolvedGiveawayIds.length === 0) {
        return badRequest("No active giveaways found.");
      }
    } else {
      if (requestedIds.length === 0) {
        return badRequest("Select at least one giveaway.");
      }
      const checks = await Promise.all(
        requestedIds.map((id) => adminFirestore.collection("giveaways").doc(id).get()),
      );
      checks.forEach((snap, index) => {
        if (!snap.exists) throw new Error(`Giveaway not found: ${requestedIds[index]}`);
        const data = snap.data() as { status?: string };
        const status = data.status ?? "draft";
        if (status !== "active" && status !== "draft") {
          throw new Error(`Giveaway is not eligible for entries: ${requestedIds[index]}`);
        }
      });
      resolvedGiveawayIds = requestedIds;
    }

    const claimsSnap = await adminFirestore
      .collection("scan_event_claim_events")
      .where("scanEventId", "==", eventId)
      .get();

    const now = Timestamp.now();
    let created = 0;
    let skipped = 0;
    let claimsUpdated = 0;
    let writeBatch = adminFirestore.batch();
    let writesInBatch = 0;
    const flush = async () => {
      if (writesInBatch === 0) return;
      await writeBatch.commit();
      writeBatch = adminFirestore.batch();
      writesInBatch = 0;
    };

    for (const claimDoc of claimsSnap.docs) {
      const claim = claimDoc.data() as {
        userId?: string;
        claimCount?: number;
        giveawayEntriesAwarded?: number;
        giveawayAwardCount?: number;
        giveawayIds?: string[];
        association?: { businessId?: string | null; locationId?: string | null; causeId?: string | null };
      };
      const userId = claim.userId;
      if (!userId) continue;
      const claimCount = Math.max(1, Math.floor(claim.claimCount ?? 1));
      const existingEntriesAwarded =
        typeof claim.giveawayEntriesAwarded === "number" ? Math.max(0, Math.floor(claim.giveawayEntriesAwarded)) : 0;
      const existingGiveawayAwardCount =
        typeof claim.giveawayAwardCount === "number" ? Math.max(0, Math.floor(claim.giveawayAwardCount)) : 0;
      const existingGiveawayIds = Array.isArray(claim.giveawayIds)
        ? claim.giveawayIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        : [];
      const mergedGiveawayIds = Array.from(new Set([...existingGiveawayIds, ...resolvedGiveawayIds]));
      const backfilledGiveawayAwardCount = resolvedGiveawayIds.length;
      const backfilledEntriesAwarded = entriesPerClaim * backfilledGiveawayAwardCount;

      writeBatch.set(
        claimDoc.ref,
        {
          giveawayEntriesAwarded: Math.max(existingEntriesAwarded, backfilledEntriesAwarded),
          giveawayAwardCount: Math.max(existingGiveawayAwardCount, backfilledGiveawayAwardCount),
          giveawayTargetMode: targetMode,
          giveawayIds: mergedGiveawayIds,
          updatedAt: now,
        },
        { merge: true },
      );
      writesInBatch += 1;
      claimsUpdated += 1;
      if (writesInBatch >= 450) await flush();

      for (const giveawayId of resolvedGiveawayIds) {
        const entryRef = adminFirestore
          .collection("giveaway_entries")
          .doc(`${giveawayId}_scan_${eventId}_${userId}_${claimCount}`);
        const existing = await entryRef.get();
        if (existing.exists) {
          skipped += 1;
          continue;
        }
        writeBatch.set(entryRef, {
          giveawayId,
          donationId: null,
          userId,
          entriesCount: entriesPerClaim,
          pointsApplied: 0,
          pointsCarryIn: 0,
          pointsCarryOut: 0,
          entryUnitPoints: null,
          entryMultiplier: null,
          scanSource: "scan_event",
          amountCents: null,
          sourceType: "scan_event",
          scanEventId: eventId,
          scanEventClaim: claimCount,
          backfilled: true,
          backfilledAt: now,
          createdAt: now,
          updatedAt: now,
        });
        writesInBatch += 1;
        created += 1;
        if (writesInBatch >= 450) await flush();
      }
    }
    await flush();

    let updatedEvent = false;
    if (updateScanEvent) {
      const nextRewards = {
        ...eventData.rewards,
        giveaway: {
          enabled: true,
          targetMode,
          giveawayIds: targetMode === "all_active" ? [] : resolvedGiveawayIds,
          entries: entriesPerClaim,
        },
      };
      await eventRef.set(
        {
          rewards: nextRewards,
          updatedAt: now,
        },
        { merge: true },
      );
      updatedEvent = true;
    }

    return NextResponse.json({
      ok: true,
      claimsScanned: claimsSnap.size,
      claimsUpdated,
      giveawayCount: resolvedGiveawayIds.length,
      resolvedGiveawayIds,
      entriesCreated: created,
      entriesSkippedAsExisting: skipped,
      updatedEvent,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to backfill entries.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
