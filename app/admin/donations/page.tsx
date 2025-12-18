import React from "react";

export default function AdminDonationsPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Donations</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Review donation activity and reconcile Stripe events (placeholder).
      </p>

      <div className="mt-6 rounded-2xl border border-black/10 p-4 text-sm text-zinc-600 dark:border-white/10 dark:text-zinc-400">
        Coming soon: donations table + drill-down into Stripe payment intent and
        charity mapping.
      </div>
    </div>
  );
}

