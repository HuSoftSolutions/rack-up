"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";
import { useRedirectIfAuthenticated } from "@/lib/auth/routeGuards";

export default function SignInPage() {
  const router = useRouter();
  const { user, loading } = useRedirectIfAuthenticated("/profile");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-black">
        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          Redirecting…
        </div>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      router.replace("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-black">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Don’t have an account?{" "}
          <Link className="underline" href="/signup">
            Create one
          </Link>
          .
        </p>

        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm">
            <div className="mb-1 font-medium">Email</div>
            <input
              className="h-11 w-full rounded-xl border border-black/10 bg-transparent px-3 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:focus:ring-white/20"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="block text-sm">
            <div className="mb-1 font-medium">Password</div>
            <input
              className="h-11 w-full rounded-xl border border-black/10 bg-transparent px-3 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:focus:ring-white/20"
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
              {error}
            </div>
          ) : null}

          <button
            className="inline-flex h-11 w-full items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </main>
    </div>
  );
}
