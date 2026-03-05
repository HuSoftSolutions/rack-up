import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { getOptionalUser } from "@/lib/server/auth";
import { adminFirestore } from "@/lib/firebase/admin";
import { calculatePointsFromConfig, resolvePointsConfig } from "@/lib/server/points-config";
import { parseQrToken } from "@/lib/server/qr-access";
import type { CauseDoc } from "@/lib/types/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateCheckoutBody = {
  amountCents: number;
  charityId: string;
  charityName?: string;
  businessId?: string;
  causeId?: string;
  pointsOverride?: number;
  causeTitle?: string;
  businessName?: string;
  locationId?: string;
  locationSlug?: string;
  qrToken?: string;
};

function badRequest(message: string, details?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...details }, { status: 400 });
}

export async function POST(request: Request) {
  let body: CreateCheckoutBody;
  try {
    body = (await request.json()) as CreateCheckoutBody;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const amountCents = body.amountCents;
  const charityId = body.charityId?.trim();
  const charityName = body.charityName?.trim();
  const businessId = body.businessId?.trim();
  const causeId = body.causeId?.trim();
  const causeTitle = body.causeTitle?.trim();
  const businessName = body.businessName?.trim();
  const locationId = body.locationId?.trim();
  const locationSlug = body.locationSlug?.trim();
  const qrToken = body.qrToken?.trim();

  const authContext = await getOptionalUser(request);
  if (!authContext?.uid) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const userId = authContext.uid;
  const customerEmail = authContext?.email ?? undefined;

  if (!Number.isInteger(amountCents) || amountCents < 50) {
    return badRequest("amountCents must be an integer >= 50.");
  }
  if (!charityId) {
    return badRequest("charityId is required.");
  }
  if (!causeId) {
    return badRequest("causeId is required.");
  }

  let scanSource: "in_person" | "remote" = "remote";
  let qrTarget: "location_landing" | "cause_specific" | "remote_landing" | "remote_cause" =
    causeId ? "remote_cause" : "remote_landing";
  let qrLocationId: string | null = null;

  if (qrToken) {
    try {
      const payload = parseQrToken(qrToken);
      if (payload) {
        const matchesBusiness =
          payload.s === "remote" ? true : payload.b === (businessId || charityId);
        const matchesCause = payload.c ? payload.c === causeId : true;
        const matchesLocation = payload.l ? payload.l === locationSlug : true;
        if (matchesBusiness && matchesCause && matchesLocation) {
          scanSource = payload.s;
          if (payload.s === "in_person") {
            qrTarget = payload.t === "location" ? "location_landing" : "cause_specific";
          } else {
            qrTarget = payload.t === "business" ? "remote_landing" : "remote_cause";
            qrLocationId = payload.a ?? null;
          }
        }
      }
    } catch {
      // If token parsing fails, fall back to remote defaults.
    }
  }

  let computedPoints: number | null = null;
  let computedBusinessId = businessId ?? null;
  let computedLocationId = locationId ?? null;
  let computedLocationSlug = locationSlug ?? null;
  if (causeId) {
    const causeSnap = await adminFirestore.collection("causes").doc(causeId).get();
    if (!causeSnap.exists) {
      return badRequest("Cause not found.");
    }
    const cause = causeSnap.data() as CauseDoc;
    if (!computedBusinessId && typeof cause.businessId === "string" && cause.businessId.trim()) {
      computedBusinessId = cause.businessId.trim();
    }
    const config = resolvePointsConfig(cause, scanSource);
    const { points, matchedOption } = calculatePointsFromConfig(amountCents, config);
    if (config.mode === "predefined" && !matchedOption) {
      return badRequest("Invalid amount for this support option.");
    }

    const minCents = cause.minAmountCents ?? 50;
    const maxCents = cause.maxAmountCents ?? 1000000;
    if (amountCents < minCents) {
      return badRequest(`Minimum support is $${(minCents / 100).toFixed(2)} for this cause.`);
    }
    if (amountCents > maxCents) {
      return badRequest(`Maximum support is $${(maxCents / 100).toFixed(0)} for this cause.`);
    }
    computedPoints = points;
  }

  if (scanSource === "remote") {
    computedLocationId = null;
    computedLocationSlug = null;
  }

  const origin = request.headers.get("origin") ?? "http://localhost:3000";
  const successUrl = `${origin}/donate/result?status=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/donate/result?status=cancel`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    submit_type: "donate",
    success_url: successUrl,
    cancel_url: cancelUrl,
    ...(customerEmail ? { customer_email: customerEmail } : {}),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: charityName ? `Donation: ${charityName}` : "Charity donation",
          },
        },
      },
    ],
    metadata: {
      charityId,
      ...(computedBusinessId ? { businessId: computedBusinessId } : {}),
      ...(scanSource === "in_person" && businessName ? { businessName } : {}),
      ...(userId ? { userId } : {}),
      ...(causeId ? { causeId } : {}),
      ...(causeTitle ? { causeTitle } : {}),
      ...(scanSource === "in_person" && computedLocationId ? { locationId: computedLocationId } : {}),
      ...(scanSource === "in_person" && computedLocationSlug ? { locationSlug: computedLocationSlug } : {}),
      ...(computedPoints !== null ? { pointsOverride: String(computedPoints) } : {}),
      ...(scanSource ? { scanSource } : {}),
      ...(qrTarget ? { qrTarget } : {}),
      ...(scanSource === "in_person" && qrLocationId ? { qrLocationId } : {}),
    },
  });

  return NextResponse.json({
    id: session.id,
    url: session.url,
  });
}

export type { CreateCheckoutBody };
