import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { calculatePointsFromCents, normalizePointsOverride } from "@/lib/server/points";
import { Timestamp } from "firebase-admin/firestore";
import { donationQualifiesForGiveaway } from "@/lib/server/giveaway-eligibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const GIVEAWAY_ENTRY_POINTS = 500;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export async function POST(request: Request) {
  const signature = (await headers()).get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header." },
      { status: 400 },
    );
  }

  const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Webhook signature verification failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
      const amountCents = session.amount_total ?? session.amount_subtotal ?? 0;
      const charityId = session.metadata?.charityId ?? "unknown";
      const businessId = session.metadata?.businessId ?? null;
      const businessName = session.metadata?.businessName ?? null;
      const userId = session.metadata?.userId ?? null;
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
      const completedAtMs = event.created
        ? event.created * 1000
        : session.created
          ? session.created * 1000
          : Date.now();
      const eventTimestamp = Timestamp.fromMillis(completedAtMs);

      if (!paymentIntentId) break;

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      });
      const latestCharge = paymentIntent.latest_charge;
      const charge =
        typeof latestCharge === "object" && latestCharge ? (latestCharge as Stripe.Charge) : null;
      const receiptUrl = charge?.receipt_url ?? null;
      const chargeId =
        charge?.id ?? (typeof latestCharge === "string" ? latestCharge : null);

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
        const resolvedUserId = userId ?? existingDonation?.userId ?? null;

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
        const entriesByGiveawayId: Record<string, number> = {};
        const safePoints = Math.max(0, points);
        const now = Timestamp.now();

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
            const carryInRaw = balanceData?.remainingPoints;
            const carryIn = typeof carryInRaw === "number" && carryInRaw > 0 ? Math.floor(carryInRaw) : 0;
            const totalPointsForEntry = carryIn + safePoints;
            const entriesCount = Math.floor(totalPointsForEntry / GIVEAWAY_ENTRY_POINTS);
            const carryOut = totalPointsForEntry % GIVEAWAY_ENTRY_POINTS;
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

            tx.set(entryRef, {
              giveawayId: giveawayDoc.id,
              donationId: paymentIntentId,
              userId: resolvedUserId,
              entriesCount,
              pointsApplied: safePoints,
              pointsCarryIn: carryIn,
              pointsCarryOut: carryOut,
              entryUnitPoints: GIVEAWAY_ENTRY_POINTS,
              scanSource,
              amountCents,
              createdAt: eventTimestamp,
              updatedAt: now,
            });
          }
        }

        const totalEntries = Object.values(entriesByGiveawayId).reduce((sum, value) => sum + value, 0);
        const firstEligibleGiveawayEntries =
          eligibleGiveawayIds.length > 0 ? (entriesByGiveawayId[eligibleGiveawayIds[0]] ?? 0) : 0;

        tx.set(txRef, {
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
        });

        tx.set(donationRef, {
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
            chargeId,
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
            entryUnitPoints: GIVEAWAY_ENTRY_POINTS,
            cumulativePointsModel: true,
            userIdPresent: Boolean(resolvedUserId),
          },
        });
      });

      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
