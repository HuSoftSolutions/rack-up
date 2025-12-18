import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateCheckoutBody = {
  amountCents: number;
  charityId: string;
  charityName?: string;
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

  if (!Number.isInteger(amountCents) || amountCents < 50) {
    return badRequest("amountCents must be an integer >= 50.");
  }
  if (!charityId) {
    return badRequest("charityId is required.");
  }

  const origin = request.headers.get("origin") ?? "http://localhost:3000";
  const successUrl = `${origin}/profile?stripe=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/profile?stripe=cancel`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    submit_type: "donate",
    success_url: successUrl,
    cancel_url: cancelUrl,
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
    },
  });

  return NextResponse.json({
    id: session.id,
    url: session.url,
  });
}

export type { CreateCheckoutBody };

