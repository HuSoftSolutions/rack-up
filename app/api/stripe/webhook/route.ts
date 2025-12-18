import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";

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
      // TODO: Write donation record to Firestore, award points, etc.
      void session;
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
