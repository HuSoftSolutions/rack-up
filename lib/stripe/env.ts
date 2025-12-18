export function stripePublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) throw new Error("Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  return key;
}

