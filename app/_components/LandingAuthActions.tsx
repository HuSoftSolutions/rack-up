"use client";

import Link from "next/link";
import React from "react";
import { signOut } from "firebase/auth";
import { useAuth } from "@/lib/auth/AuthProvider";
import { firebaseAuth } from "@/lib/firebase/client";
import { useAdminStatus } from "@/lib/auth/admin";

export default function LandingAuthActions() {
  const { user, loading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdminStatus();

  if (loading) {
    return (
      <div className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
        Checking session…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          href="/signin"
        >
          Sign in
        </Link>
        <Link
          className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 px-6 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-[#1a1a1a]"
          href="/signup"
        >
          Create account
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <div>
          Signed in as <span className="font-medium">{user.email}</span>
        </div>
        {!adminLoading && isAdmin ? (
          <span className="inline-flex items-center rounded-full border border-black/10 bg-black/[.04] px-2.5 py-1 text-xs font-medium text-zinc-900 dark:border-white/15 dark:bg-white/10 dark:text-zinc-50">
            Admin
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <Link
          className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          href="/profile"
        >
          Go to profile
        </Link>
        {!adminLoading && isAdmin ? (
          <Link
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 px-6 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-[#1a1a1a]"
            href="/admin"
          >
            Admin dashboard
          </Link>
        ) : null}
        <button
          className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 px-6 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-[#1a1a1a]"
          type="button"
          onClick={() => signOut(firebaseAuth)}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
