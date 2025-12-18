"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { signOut } from "firebase/auth";
import { useRequireAuth } from "@/lib/auth/routeGuards";
import { firebaseAuth } from "@/lib/firebase/client";
import { useAdminStatus } from "@/lib/auth/admin";

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading } = useRequireAuth("/signin");
  const [signingOut, setSigningOut] = useState(false);
  const { isAdmin, loading: adminLoading } = useAdminStatus();

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-black">
        <div className="text-sm text-zinc-600 dark:text-zinc-400">Loading…</div>
      </div>
    );
  }

  async function onSignOut() {
    setSigningOut(true);
    await signOut(firebaseAuth);
    router.replace("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <main className="w-full max-w-2xl rounded-2xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-black">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <div>
                Signed in as <span className="font-medium">{user.email}</span>
              </div>
              {!adminLoading && isAdmin ? (
                <span className="inline-flex items-center rounded-full border border-black/10 bg-black/[.04] px-2.5 py-1 text-xs font-medium text-zinc-900 dark:border-white/15 dark:bg-white/10 dark:text-zinc-50">
                  Admin
                </span>
              ) : null}
            </div>
          </div>
          <button
            className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 px-5 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-60 dark:border-white/15 dark:hover:bg-[#1a1a1a]"
            onClick={onSignOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>

        <div className="mt-8 rounded-xl border border-black/10 p-4 text-sm dark:border-white/10">
          <div className="font-medium">Next</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-600 dark:text-zinc-400">
            <li>Store profile/points in Firestore</li>
            <li>Charity list + redeem / donate flows</li>
            <li>Stripe checkout for paid donations</li>
          </ul>
        </div>

        <div className="mt-8">
          <Link className="text-sm underline" href="/">
            Back to landing
          </Link>
          {!adminLoading && isAdmin ? (
            <>
              {" "}
              ·{" "}
              <Link className="text-sm underline" href="/admin">
                Admin dashboard
              </Link>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
