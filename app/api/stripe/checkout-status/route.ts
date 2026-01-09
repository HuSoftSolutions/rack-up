import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { calculatePointsFromCents, normalizePointsOverride } from "@/lib/server/points";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent.charges"],
    });

    const paymentIntent = session.payment_intent as Stripe.PaymentIntent | null;
    const charge = paymentIntent?.charges?.data?.[0];
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

    return NextResponse.json({
      status: session.status,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
      success: session.status === "complete" && session.payment_status === "paid",
      charityId: session.metadata?.charityId ?? null,
      businessId: session.metadata?.businessId ?? null,
      causeId: session.metadata?.causeId ?? null,
      causeTitle: session.metadata?.causeTitle ?? donationDoc?.causeTitle ?? null,
      businessName: session.metadata?.businessName ?? donationDoc?.businessName ?? null,
      points,
      locationId: session.metadata?.locationId ?? donationDoc?.locationId ?? null,
      locationSlug: session.metadata?.locationSlug ?? donationDoc?.locationSlug ?? null,
      receiptUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
