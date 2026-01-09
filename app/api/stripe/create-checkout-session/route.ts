import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { getOptionalUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateCheckoutBody = {
  amountCents: number;
  charityId: string;
  charityName?: string;
  businessId?: string;
  userId?: string;
  causeId?: string;
  pointsOverride?: number;
  causeTitle?: string;
  businessName?: string;
  locationId?: string;
  locationSlug?: string;
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
  const userIdFromBody = body.userId?.trim();
  const causeId = body.causeId?.trim();
  const causeTitle = body.causeTitle?.trim();
  const businessName = body.businessName?.trim();
  const locationId = body.locationId?.trim();
  const locationSlug = body.locationSlug?.trim();
  const pointsOverride =
    typeof body.pointsOverride === "number" && body.pointsOverride >= 0
      ? body.pointsOverride
      : undefined;

  const authContext = await getOptionalUser(request);
  const userId = authContext?.uid ?? userIdFromBody;
  const customerEmail = authContext?.email ?? undefined;

  if (!Number.isInteger(amountCents) || amountCents < 50) {
    return badRequest("amountCents must be an integer >= 50.");
  }
  if (!charityId) {
    return badRequest("charityId is required.");
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
      ...(businessId ? { businessId } : {}),
      ...(businessName ? { businessName } : {}),
      ...(userId ? { userId } : {}),
      ...(causeId ? { causeId } : {}),
      ...(causeTitle ? { causeTitle } : {}),
      ...(locationId ? { locationId } : {}),
      ...(locationSlug ? { locationSlug } : {}),
      ...(pointsOverride !== undefined
        ? { pointsOverride: String(pointsOverride) }
        : {}),
    },
  });

  return NextResponse.json({
    id: session.id,
    url: session.url,
  });
}

export type { CreateCheckoutBody };
