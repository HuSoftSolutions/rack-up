"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  confirmPasswordReset,
  signInWithEmailAndPassword,
  updateProfile,
  verifyPasswordResetCode,
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";
import { fetchRedirectTarget } from "@/lib/auth/redirectTarget";
import { normalizeClientRequestError } from "@/lib/client/request-error";
import { Button } from "@/ui-kit/button";
import { Input } from "@/ui-kit/input";

function InviteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "ready" | "submitting" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirm, setConfirm] = useState<string>("");

  const oobCode = useMemo(() => searchParams.get("oobCode"), [searchParams]);

  useEffect(() => {
    let canceled = false;

    async function run() {
      if (!oobCode) {
        setError("Invite link is missing or invalid.");
        setStatus("error");
        return;
      }
      setStatus("loading");
      setError(null);
      try {
        const resetEmail = await verifyPasswordResetCode(firebaseAuth, oobCode);
        if (!canceled) {
          setEmail(resetEmail);
          setStatus("ready");
        }
      } catch (err) {
        if (!canceled) {
          setError(normalizeClientRequestError(err, "Invite link is invalid or expired."));
          setStatus("error");
        }
      }
    }

    void run();
    return () => {
      canceled = true;
    };
  }, [oobCode]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!oobCode || !email) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setStatus("submitting");
    setError(null);
    try {
      await confirmPasswordReset(firebaseAuth, oobCode, password);
      await signInWithEmailAndPassword(firebaseAuth, email, password);
      if (displayName.trim()) {
        const currentUser = firebaseAuth.currentUser;
        if (currentUser) {
          await updateProfile(currentUser, { displayName: displayName.trim() });
        }
      }
      const redirectTo = (await fetchRedirectTarget()) ?? "/profile";
      router.replace(redirectTo);
    } catch (err) {
      setError(normalizeClientRequestError(err, "Failed to complete signup."));
      setStatus("ready");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-black via-zinc-950 to-[#0b0b0f] px-6 text-white">
      <div className="w-full max-w-lg space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300">
            Welcome to Rack Up
          </div>
          <h1 className="mt-2 text-2xl font-semibold">Complete your registration</h1>
          <p className="mt-1 text-sm text-zinc-300">
            Set your password to activate your account.
          </p>
        </div>

        {status === "error" ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error ?? "Invite link is invalid or expired."}
          </div>
        ) : null}

        {status !== "error" ? (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Email
              </label>
              <Input type="email" value={email} readOnly />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Display name
              </label>
              <Input
                type="text"
                placeholder="Optional"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Password
              </label>
              <Input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Confirm password
              </label>
              <Input
                type="password"
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <Button type="submit" color="emerald" disabled={status !== "ready"}>
              {status === "submitting" ? "Setting up…" : "Set password and continue"}
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-black via-zinc-950 to-[#0b0b0f] px-6 text-white">
          <div className="text-sm text-zinc-300">Loading…</div>
        </div>
      }
    >
      <InviteClient />
    </Suspense>
  );
}
