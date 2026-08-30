import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/lib/server/auth";
import {
  DEFAULT_PROXIMITY_RADIUS_METERS,
  cadenceToMs,
  inspectScanEventToken,
  resolveProximityMode,
  verifyLocationGrant,
} from "@/lib/server/scan-events";
import { maybeAwardSameDayBonus } from "@/lib/server/same-day-bonus";
import { maybeAwardScanChallengeEntries } from "@/lib/server/scan-challenges";
import type {
  ResolvedProximityMode,
  ScanEventAssociation,
  ScanEventDoc,
} from "@/lib/types/scan-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClaimBody = {
  token?: string;
  /** Signed proof from /api/scan-events/verify-location that the user is on site. */
  locationGrant?: string | null;
};

type ProximityRecord = {
  mode: ResolvedProximityMode;
  radiusMeters: number | null;
  /** Distance carried on the verified grant, when one was presented. */
  distanceMeters: number | null;
  verified: boolean;
  /** Why verification failed or could not run. */
  failureReason: "no_place" | "missing" | "expired" | "invalid" | null;
};

type ClaimState = {
  claimCount?: number;
  createdAt?: Timestamp;
  lastClaimAt?: Timestamp;
  nextEligibleAt?: Timestamp;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const EST_OFFSET_MS = -5 * 60 * 60 * 1000;

function estDayStartMs(input: Date): number {
  const shifted = input.getTime() + EST_OFFSET_MS;
  const shiftedDayStart = Math.floor(shifted / DAY_MS) * DAY_MS;
  return shiftedDayStart - EST_OFFSET_MS;
}

function estCalendarDayDiff(a: Date, b: Date): number {
  return Math.floor((estDayStartMs(a) - estDayStartMs(b)) / DAY_MS);
}

function nextEligibleForDayCadence(now: Timestamp, intervalDays: number): Timestamp {
  const safeIntervalDays = Math.max(1, Math.floor(intervalDays));
  const start = estDayStartMs(now.toDate());
  return Timestamp.fromMillis(start + safeIntervalDays * DAY_MS);
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
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

export async function POST(request: Request) {
  try {
    const { uid } = await requireUser(request);
    let body: ClaimBody;
    try {
      body = (await request.json()) as ClaimBody;
    } catch {
      return badRequest("Invalid JSON body.");
    }
    const token = body.token?.trim();
    const locationGrant = typeof body.locationGrant === "string" ? body.locationGrant.trim() : null;
    const inspected = inspectScanEventToken(token);
    if (!inspected.ok) {
      return badRequest(`Invalid scan token (${inspected.reason}).`);
    }

    const eventRef = adminFirestore.collection("scan_events").doc(inspected.eventId);
    const claimRef = adminFirestore.collection("scan_event_claims").doc(`${inspected.eventId}_${uid}`);
    const now = Timestamp.now();
    let awardedPoints = 0;
    let awardedEntries = 0;
    let giveawayAwardCount = 0;
    let giveawayIdsUsed: string[] = [];
    let giveawayTargetMode: "selected" | "all_active" = "selected";
    let claimCount = 0;
    let nextEligibleAt: Timestamp | null = null;
    let blockedByCadence = false;
    let blockedByDistance = false;
    let proximity: ProximityRecord = {
      mode: "off",
      radiusMeters: null,
      distanceMeters: null,
      verified: false,
      failureReason: null,
    };
    let scannedBusinessId: string | null = null;
    let scannedAssociation: ScanEventAssociation | null = null;

    await adminFirestore.runTransaction(async (tx) => {
      const [eventSnap, claimSnap] = await Promise.all([tx.get(eventRef), tx.get(claimRef)]);
      if (!eventSnap.exists) throw new Error("Scan event not found.");
      const event = eventSnap.data() as ScanEventDoc;
      if (event.active === false) throw new Error("This scan event is inactive.");
      scannedBusinessId = event.association?.businessId ?? null;
      scannedAssociation = event.association ?? null;

      const place = event.place ?? null;
      const proximityMode = resolveProximityMode(place, event.proximity);
      if (proximityMode !== "off") {
        const radiusMeters =
          Math.max(1, Math.floor(event.proximity?.radiusMeters ?? DEFAULT_PROXIMITY_RADIUS_METERS)) ||
          DEFAULT_PROXIMITY_RADIUS_METERS;
        proximity = { ...proximity, mode: proximityMode, radiusMeters };

        if (!place) {
          // resolveProximityMode already guarantees coordinates here; kept as a
          // belt-and-braces fail-open so a live campaign can never hard-lock.
          proximity.failureReason = "no_place";
        } else {
          const verified = verifyLocationGrant(locationGrant, inspected.eventId, uid);
          if (verified.ok) {
            proximity.verified = true;
            proximity.distanceMeters = verified.distanceMeters;
          } else {
            proximity.failureReason =
              verified.reason === "missing"
                ? "missing"
                : verified.reason === "expired"
                  ? "expired"
                  : "invalid";
            if (proximityMode === "enforce") {
              blockedByDistance = true;
              claimCount = Math.max(
                0,
                Math.floor((claimSnap.data() as ClaimState | undefined)?.claimCount ?? 0),
              );
              // This return skips the claim-event write below, so log the block
              // here — queued writes still commit when the transaction resolves.
              tx.set(adminFirestore.collection("scan_event_location_denials").doc(), {
                scanEventId: inspected.eventId,
                userId: uid,
                stage: "claim",
                outcome: proximity.failureReason,
                mode: proximityMode,
                distanceMeters: null,
                accuracyMeters: null,
                radiusMeters,
                allowanceMeters: null,
                createdAt: now,
              });
              return;
            }
          }
        }
      }

      const claimState = (claimSnap.data() as ClaimState | undefined) ?? undefined;
      if (event.cadence.unit === "days") {
        const intervalDays = Math.max(1, Math.floor(event.cadence.interval));
        const lastClaimAt = claimState?.lastClaimAt;
        if (lastClaimAt) {
          const elapsedCalendarDays = estCalendarDayDiff(now.toDate(), lastClaimAt.toDate());
          if (elapsedCalendarDays < intervalDays) {
            blockedByCadence = true;
            nextEligibleAt = nextEligibleForDayCadence(lastClaimAt, intervalDays);
            claimCount = Math.max(0, Math.floor(claimState?.claimCount ?? 0));
            return;
          }
        }
        nextEligibleAt = nextEligibleForDayCadence(now, intervalDays);
      } else {
        const currentNextEligibleAt = claimState?.nextEligibleAt;
        if (
          currentNextEligibleAt &&
          typeof currentNextEligibleAt.toMillis === "function" &&
          currentNextEligibleAt.toMillis() > now.toMillis()
        ) {
          blockedByCadence = true;
          nextEligibleAt = currentNextEligibleAt;
          claimCount = Math.max(0, Math.floor(claimState?.claimCount ?? 0));
          return;
        }
        const cadenceMs = cadenceToMs(event.cadence);
        nextEligibleAt = Timestamp.fromMillis(now.toMillis() + cadenceMs);
      }

      claimCount = Math.max(0, Math.floor(claimState?.claimCount ?? 0)) + 1;

      awardedPoints =
        event.rewards.points.enabled && event.rewards.points.amount > 0
          ? Math.floor(event.rewards.points.amount)
          : 0;

      awardedEntries =
        event.rewards.giveaway.enabled && event.rewards.giveaway.entries > 0
          ? Math.floor(event.rewards.giveaway.entries)
          : 0;

      const giveawayRaw = event.rewards.giveaway as
        | { enabled?: boolean; targetMode?: string; giveawayIds?: string[]; giveawayId?: string | null }
        | undefined;
      giveawayTargetMode = giveawayRaw?.targetMode === "all_active" ? "all_active" : "selected";
      let targetedGiveawayIds = Array.isArray(giveawayRaw?.giveawayIds) ? giveawayRaw.giveawayIds : [];
      const legacyGiveawayId =
        typeof giveawayRaw?.giveawayId === "string" ? giveawayRaw.giveawayId.trim() : "";
      if (legacyGiveawayId && targetedGiveawayIds.length === 0) {
        targetedGiveawayIds = [legacyGiveawayId];
      }

      if (awardedEntries > 0) {
        if (giveawayTargetMode === "all_active") {
          const activeSnap = await tx.get(
            adminFirestore.collection("giveaways").where("status", "==", "active"),
          );
          targetedGiveawayIds = activeSnap.docs.map((doc) => doc.id);
        } else {
          targetedGiveawayIds = Array.from(new Set(targetedGiveawayIds));
          if (targetedGiveawayIds.length === 0) {
            throw new Error("No giveaways are selected for this scan event.");
          }
          for (const giveawayId of targetedGiveawayIds) {
            const giveawayRef = adminFirestore.collection("giveaways").doc(giveawayId);
            const giveawaySnap = await tx.get(giveawayRef);
            if (!giveawaySnap.exists) {
              throw new Error(`Selected giveaway no longer exists: ${giveawayId}`);
            }
            const giveawayData = giveawaySnap.data() as { status?: string } | undefined;
            const giveawayStatus = giveawayData?.status ?? "draft";
            if (giveawayStatus !== "active" && giveawayStatus !== "draft") {
              throw new Error(`Selected giveaway is not eligible for new entries: ${giveawayId}`);
            }
          }
        }

        giveawayAwardCount = targetedGiveawayIds.length;
        giveawayIdsUsed = targetedGiveawayIds;
      }

      tx.set(
        claimRef,
        {
          eventId: inspected.eventId,
          userId: uid,
          claimCount,
          lastClaimAt: now,
          nextEligibleAt,
          updatedAt: now,
          createdAt: claimState?.createdAt ?? now,
        },
        { merge: true },
      );

      if (awardedPoints > 0) {
        const transactionRef = adminFirestore.collection("transactions").doc();
        tx.set(transactionRef, {
          type: "scan_event",
          status: "completed",
          pointsDelta: awardedPoints,
          amountCents: null,
          userId: uid,
          causeId: event.association.causeId ?? null,
          businessId: event.association.businessId ?? null,
          locationId: event.association.locationId ?? null,
          scanSource: "scan_event",
          scanEventId: inspected.eventId,
          scanEventClaim: claimCount,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (awardedEntries > 0 && giveawayAwardCount > 0) {
        awardedEntries = awardedEntries * giveawayAwardCount;
        for (const giveawayId of giveawayIdsUsed) {
          const entryRef = adminFirestore
            .collection("giveaway_entries")
            .doc(`${giveawayId}_scan_${inspected.eventId}_${uid}_${claimCount}`);
          tx.set(entryRef, {
            giveawayId,
            donationId: null,
            userId: uid,
            entriesCount: Math.floor(event.rewards.giveaway.entries),
            pointsApplied: 0,
            pointsCarryIn: 0,
            pointsCarryOut: 0,
            entryUnitPoints: null,
            entryMultiplier: null,
            scanSource: "scan_event",
            amountCents: null,
            sourceType: "scan_event",
            scanEventId: inspected.eventId,
            scanEventClaim: claimCount,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      const claimEventRef = adminFirestore.collection("scan_event_claim_events").doc();
      tx.set(claimEventRef, {
        scanEventId: inspected.eventId,
        userId: uid,
        claimCount,
        pointsAwarded: awardedPoints,
        giveawayEntriesAwarded: awardedEntries,
        giveawayAwardCount,
        giveawayTargetMode,
        giveawayIds: giveawayIdsUsed,
        association: event.association,
        proximity,
        createdAt: now,
      });
    });

    if (blockedByDistance) {
      return NextResponse.json(
        {
          ok: false,
          blockedByDistance: true,
          reason: proximity.failureReason,
          claimCount,
          distanceMeters: proximity.distanceMeters,
          radiusMeters: proximity.radiusMeters,
        },
        { status: 403 },
      );
    }

    if (blockedByCadence) {
      return NextResponse.json(
        {
          ok: false,
          blockedByCadence: true,
          claimCount,
          nextEligibleAt: toIso(nextEligibleAt),
        },
        { status: 429 },
      );
    }

    await adminFirestore.collection("users").doc(uid).set(
      {
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    let bonusPointsAwarded = 0;
    let bonusAwarded = false;
    try {
      const bonusResult = await maybeAwardSameDayBonus({
        userId: uid,
        scanEventId: inspected.eventId,
        scannedBusinessId,
        now,
      });
      bonusAwarded = bonusResult.awarded;
      bonusPointsAwarded = bonusResult.pointsAwarded;
    } catch {
      // Bonus is non-critical; never block the primary claim response.
    }

    let challengeAwarded = false;
    let challengeEntriesAwarded = 0;
    try {
      const challengeResult = await maybeAwardScanChallengeEntries({
        userId: uid,
        scanEventId: inspected.eventId,
        association: scannedAssociation,
        now,
      });
      challengeAwarded = challengeResult.awarded;
      challengeEntriesAwarded = challengeResult.entriesAwarded;
    } catch {
      // Scan challenges are non-critical; never block the primary claim response.
    }

    return NextResponse.json({
      ok: true,
      blockedByCadence: false,
      claimCount,
      pointsAwarded: awardedPoints,
      giveawayEntriesAwarded: awardedEntries,
      giveawayAwardCount,
      nextEligibleAt: toIso(nextEligibleAt),
      sameDayBonus: {
        awarded: bonusAwarded,
        pointsAwarded: bonusPointsAwarded,
      },
      scanChallenge: {
        awarded: challengeAwarded,
        entriesAwarded: challengeEntriesAwarded,
      },
      proximity: {
        mode: proximity.mode,
        verified: proximity.verified,
        distanceMeters: proximity.distanceMeters,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Failed to claim scan reward.";
    const status = message.toLowerCase().includes("inactive") ? 410 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
