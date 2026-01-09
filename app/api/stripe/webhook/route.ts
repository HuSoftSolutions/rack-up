import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { calculatePointsFromCents, normalizePointsOverride } from "@/lib/server/points";
import { Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      const pointsOverride = normalizePointsOverride(session.metadata?.pointsOverride);
      const eventTimestamp = session.created
        ? Timestamp.fromMillis(session.created * 1000)
        : Timestamp.now();

      if (!paymentIntentId) break;

      const points = pointsOverride ?? calculatePointsFromCents(amountCents);
      const txRef = adminFirestore.collection("transactions").doc(paymentIntentId);
      const donationRef = adminFirestore.collection("donations").doc(paymentIntentId);

      await adminFirestore.runTransaction(async (tx) => {
        const existing = await tx.get(txRef);
        if (existing.exists) return;

        tx.set(txRef, {
          type: "donation",
          status: "completed",
          amountCents,
          pointsDelta: points,
          charityId,
          businessId,
          businessName,
          locationId,
          locationSlug,
          userId,
          causeId,
          causeTitle,
          stripePaymentIntentId: paymentIntentId,
          createdAt: eventTimestamp,
        });

        tx.set(donationRef, {
          userId,
          charityId,
          businessId,
          causeId,
          businessName,
          locationId,
          locationSlug,
          causeTitle,
          amountCents,
          points,
          stripe: {
            paymentIntentId,
            checkoutSessionId: session.id,
            customer: session.customer ?? null,
          },
          status: "completed",
          createdAt: eventTimestamp,
        });
      });

      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
