import React from "react";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{hint}</div>
    </div>
  );
}

export default function AdminOverviewPage() {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Admin metrics and management tools (placeholders for now).
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Users" value="—" hint="Total users (from Firestore)" />
        <StatCard label="Points Issued" value="—" hint="Total points across users" />
        <StatCard label="Donations" value="—" hint="Stripe-backed donations count" />
      </div>

      <div className="mt-6 rounded-2xl border border-black/10 p-4 dark:border-white/10">
        <div className="text-sm font-medium">Next steps</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>Add Firestore collections: users, charities, donations</li>
          <li>Build admin CRUD for charities</li>
          <li>Wire Stripe webhooks → donations</li>
        </ul>
      </div>
    </div>
  );
}

