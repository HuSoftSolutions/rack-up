import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { calculatePointsFromCents, normalizePointsOverride } from "@/lib/server/points";
import { Timestamp } from "firebase-admin/firestore";
import { donationQualifiesForGiveaway } from "@/lib/server/giveaway-eligibility";
import {
  getDefaultEntryUnitPoints,
  getEntryMultiplier,
  normalizeGiveawayEntryConfig,
} from "@/lib/server/giveaway-entry-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CommunityDrawingSummary = {
  id: string;
  title: string;
  description: string;
  entriesAllocated: number;
  prize: {
    name?: string;
    value?: string;
    imageUrl?: string;
    description?: string;
  } | null;
};

async function buildCommunityDrawingSummaries(
  entriesByGiveawayId: Record<string, number>,
): Promise<CommunityDrawingSummary[]> {
  const giveawayIds = Object.keys(entriesByGiveawayId);
  if (giveawayIds.length === 0) return [];

  const docs = await Promise.all(
    giveawayIds.map((id) => adminFirestore.collection("giveaways").doc(id).get()),
  );

  return docs
    .filter((doc) => doc.exists)
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const prizeRaw =
        data.prize && typeof data.prize === "object"
          ? (data.prize as Record<string, unknown>)
          : null;
      const prize = prizeRaw
        ? {
            name: typeof prizeRaw.name === "string" ? prizeRaw.name : undefined,
            value: typeof prizeRaw.value === "string" ? prizeRaw.value : undefined,
            imageUrl: typeof prizeRaw.imageUrl === "string" ? prizeRaw.imageUrl : undefined,
            description: typeof prizeRaw.description === "string" ? prizeRaw.description : undefined,
          }
        : null;
      return {
        id: doc.id,
        title: typeof data.title === "string" ? data.title : doc.id,
        description: typeof data.description === "string" ? data.description : "",
        entriesAllocated: entriesByGiveawayId[doc.id] ?? 0,
        prize,
      } satisfies CommunityDrawingSummary;
    })
    .sort((a, b) => b.entriesAllocated - a.entriesAllocated);
}

async function ensureGiveawayCapture(params: {
  session: Stripe.Checkout.Session;
  paymentIntent: Stripe.PaymentIntent | null;
  paymentIntentId: string;
  receiptUrl: string | null;
}) {
  const { session, paymentIntent, paymentIntentId, receiptUrl } = params;

  const amountCents = session.amount_total ?? session.amount_subtotal ?? 0;
  const charityId = session.metadata?.charityId ?? "unknown";
  const businessId = session.metadata?.businessId ?? null;
  const businessName = session.metadata?.businessName ?? null;
  const causeId = session.metadata?.causeId ?? null;
  const causeTitle = session.metadata?.causeTitle ?? null;
  const locationId = session.metadata?.locationId ?? null;
  const locationSlug = session.metadata?.locationSlug ?? null;
  const scanSource = session.metadata?.scanSource ?? "remote";
  const qrTarget = session.metadata?.qrTarget ?? null;
  const qrLocationId = session.metadata?.qrLocationId ?? null;
  const pointsOverride = normalizePointsOverride(session.metadata?.pointsOverride);
  const donorName = session.customer_details?.name ?? null;
  const donorEmail = session.customer_details?.email ?? session.customer_email ?? null;
  const donorPhone = session.customer_details?.phone ?? null;

  const latestCharge = paymentIntent?.latest_charge;
  const charge =
    typeof latestCharge === "object" && latestCharge
      ? (latestCharge as Stripe.Charge)
      : null;
  const chargeCreatedMs = charge?.created ? charge.created * 1000 : null;
  const eventTimestamp = Timestamp.fromMillis(
    chargeCreatedMs ?? (session.created ? session.created * 1000 : Date.now()),
  );

  const points = pointsOverride ?? calculatePointsFromCents(amountCents);
  const txRef = adminFirestore.collection("transactions").doc(paymentIntentId);
  const donationRef = adminFirestore.collection("donations").doc(paymentIntentId);
  const giveawaysRef = adminFirestore.collection("giveaways");

  await adminFirestore.runTransaction(async (tx) => {
    const [existingTxSnap, existingDonationSnap] = await Promise.all([
      tx.get(txRef),
      tx.get(donationRef),
    ]);
    const existingDonation = existingDonationSnap.exists
      ? (existingDonationSnap.data() as { userId?: string | null } | undefined)
      : undefined;
    const resolvedUserId = session.metadata?.userId ?? existingDonation?.userId ?? null;

    const activeGiveawaysSnap = await giveawaysRef
      .where("status", "==", "active")
      .get();
    const activeGiveaways = activeGiveawaysSnap.docs.filter((doc) => {
      const data = doc.data() as { eligibility?: unknown };
      if (
        !donationQualifiesForGiveaway(
          {
            causeId,
            businessId,
            locationId: locationId ?? qrLocationId,
            scanSource,
          },
          data.eligibility,
        )
      ) {
        return false;
      }
      return true;
    });

    const eligibleGiveawayIds = activeGiveaways.map((doc) => doc.id);
    const now = Timestamp.now();
    const entriesByGiveawayId: Record<string, number> = {};
    const safePoints = Math.max(0, points);

    if (activeGiveaways.length > 0 && resolvedUserId) {
      for (const giveawayDoc of activeGiveaways) {
        const entryId = `${giveawayDoc.id}_${paymentIntentId}`;
        const entryRef = adminFirestore.collection("giveaway_entries").doc(entryId);
        const existingEntrySnap = await tx.get(entryRef);
        if (existingEntrySnap.exists) {
          const existingEntries = (existingEntrySnap.data() as { entriesCount?: number } | undefined)?.entriesCount;
          entriesByGiveawayId[giveawayDoc.id] = typeof existingEntries === "number" ? existingEntries : 0;
          continue;
        }

        const balanceRef = adminFirestore
          .collection("giveaway_point_balances")
          .doc(`${giveawayDoc.id}_${resolvedUserId}`);
        const balanceSnap = await tx.get(balanceRef);
        const balanceData = balanceSnap.data() as {
          remainingPoints?: number;
          totalPointsProcessed?: number;
          totalEntriesAwarded?: number;
        } | undefined;
        const giveawayData = giveawayDoc.data() as { entryConfig?: unknown };
        const entryConfig = normalizeGiveawayEntryConfig(giveawayData.entryConfig);
        const entryUnit = entryConfig.entryUnitPoints;
        const entryMultiplier = getEntryMultiplier(entryConfig, scanSource);
        const carryIn = typeof balanceData?.remainingPoints === "number" && balanceData.remainingPoints > 0
          ? Math.floor(balanceData.remainingPoints)
          : 0;
        const totalPointsForEntry = carryIn + safePoints;
        const baseEntries = Math.floor(totalPointsForEntry / entryUnit);
        const entriesCount = baseEntries * entryMultiplier;
        const carryOut = totalPointsForEntry % entryUnit;
        entriesByGiveawayId[giveawayDoc.id] = entriesCount;

        tx.set(
          balanceRef,
          {
            giveawayId: giveawayDoc.id,
            userId: resolvedUserId,
            remainingPoints: carryOut,
            totalPointsProcessed: (balanceData?.totalPointsProcessed ?? 0) + safePoints,
            totalEntriesAwarded: (balanceData?.totalEntriesAwarded ?? 0) + entriesCount,
            lastDonationId: paymentIntentId,
            updatedAt: now,
          },
          { merge: true },
        );

        tx.set(
          entryRef,
          {
            giveawayId: giveawayDoc.id,
            donationId: paymentIntentId,
            userId: resolvedUserId,
            entriesCount,
            pointsApplied: safePoints,
            pointsCarryIn: carryIn,
            pointsCarryOut: carryOut,
            entryUnitPoints: entryUnit,
            entryMultiplier,
            scanSource,
            amountCents,
            createdAt: eventTimestamp,
            updatedAt: now,
          },
          { merge: true },
        );
      }
    }

    const totalEntries = Object.values(entriesByGiveawayId).reduce((sum, value) => sum + value, 0);
    const firstEligibleGiveawayEntries =
      eligibleGiveawayIds.length > 0 ? (entriesByGiveawayId[eligibleGiveawayIds[0]] ?? 0) : 0;

    tx.set(
      txRef,
      {
        type: "donation",
        status: "completed",
        amountCents,
        pointsDelta: points,
        giveawayEntries: totalEntries,
        charityId,
        businessId,
        businessName,
        locationId,
        locationSlug,
        scanSource,
        qrTarget,
        qrLocationId,
        userId: resolvedUserId,
        causeId,
        causeTitle,
        stripePaymentIntentId: paymentIntentId,
        createdAt: eventTimestamp,
        updatedAt: now,
        webhookReplayed: existingTxSnap.exists,
        reconciledFromCheckoutStatus: true,
      },
      { merge: true },
    );

    tx.set(
      donationRef,
      {
        userId: resolvedUserId,
        donorName,
        donorEmail,
        donorPhone,
        charityId,
        businessId,
        causeId,
        businessName,
        locationId,
        locationSlug,
        causeTitle,
        amountCents,
        points,
        giveawayEntries: totalEntries,
        scanSource,
        qrTarget,
        qrLocationId,
        stripe: {
          paymentIntentId,
          checkoutSessionId: session.id,
          customer: session.customer ?? null,
          chargeId: charge?.id ?? (typeof latestCharge === "string" ? latestCharge : null),
          receiptUrl,
        },
        status: "completed",
        createdAt: eventTimestamp,
        updatedAt: now,
        giveawayCapture: {
          lastAttemptAt: now,
          eligibleGiveawayIds,
          entriesByGiveawayId,
          totalEntriesAcrossGiveaways: totalEntries,
          totalEntriesPerGiveaway: firstEligibleGiveawayEntries,
          entryUnitPoints: getDefaultEntryUnitPoints(),
          cumulativePointsModel: true,
          userIdPresent: Boolean(resolvedUserId),
          reconciledFromCheckoutStatus: true,
        },
      },
      { merge: true },
    );
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent.latest_charge"],
    });

    const paymentIntent = session.payment_intent as Stripe.PaymentIntent | null;
    const latestCharge = paymentIntent?.latest_charge;
    const charge =
      typeof latestCharge === "object" && latestCharge
        ? (latestCharge as Stripe.Charge)
        : null;
    const receiptUrl = charge?.receipt_url ?? null;
    const paymentIntentId = paymentIntent?.id ?? null;

    let donationDoc: Record<string, unknown> | null = null;
    if (paymentIntentId) {
      const snap = await adminFirestore.collection("donations").doc(paymentIntentId).get();
      if (snap.exists) donationDoc = snap.data() ?? null;
    }

    const pointsOverride = normalizePointsOverride(session.metadata?.pointsOverride);
    const pointsFromAmount =
      typeof session.amount_total === "number"
        ? calculatePointsFromCents(session.amount_total)
        : null;
    const points =
      typeof donationDoc?.points === "number"
        ? donationDoc.points
        : pointsOverride ?? pointsFromAmount;

    const isPaid = session.status === "complete" && session.payment_status === "paid";
    if (isPaid && paymentIntentId) {
      await ensureGiveawayCapture({
        session,
        paymentIntent,
        paymentIntentId,
        receiptUrl,
      });
      const refreshedDonationSnap = await adminFirestore.collection("donations").doc(paymentIntentId).get();
      if (refreshedDonationSnap.exists) {
        donationDoc = refreshedDonationSnap.data() ?? null;
      }
    }

    const giveawayCapture =
      donationDoc?.giveawayCapture && typeof donationDoc.giveawayCapture === "object"
        ? (donationDoc.giveawayCapture as Record<string, unknown>)
        : null;
    const entriesByGiveawayIdRaw =
      giveawayCapture?.entriesByGiveawayId && typeof giveawayCapture.entriesByGiveawayId === "object"
        ? (giveawayCapture.entriesByGiveawayId as Record<string, unknown>)
        : {};
    const entriesByGiveawayId = Object.fromEntries(
      Object.entries(entriesByGiveawayIdRaw).map(([key, value]) => [
        key,
        typeof value === "number" && Number.isFinite(value) ? value : 0,
      ]),
    );
    const communityDrawings = await buildCommunityDrawingSummaries(entriesByGiveawayId);
    const communityDrawingEntries =
      typeof donationDoc?.giveawayEntries === "number"
        ? donationDoc.giveawayEntries
        : Object.values(entriesByGiveawayId).reduce((sum, value) => sum + value, 0);

    return NextResponse.json({
      status: session.status,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
      success: isPaid,
      charityId: session.metadata?.charityId ?? null,
      businessId: session.metadata?.businessId ?? null,
      causeId: session.metadata?.causeId ?? null,
      causeTitle: session.metadata?.causeTitle ?? donationDoc?.causeTitle ?? null,
      businessName: session.metadata?.businessName ?? donationDoc?.businessName ?? null,
      points,
      locationId: session.metadata?.locationId ?? donationDoc?.locationId ?? null,
      locationSlug: session.metadata?.locationSlug ?? donationDoc?.locationSlug ?? null,
      receiptUrl,
      communityDrawingEntries,
      communityDrawings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
