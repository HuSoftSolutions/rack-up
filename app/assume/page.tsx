"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signInWithCustomToken, signOut } from "firebase/auth";
import { getAssumeAuth, setAssumeMode } from "@/lib/firebase/client";
import { Button } from "@/ui-kit/button";

function AssumeClient() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const token = useMemo(() => searchParams.get("token"), [searchParams]);
  const redirectTo = useMemo(() => {
    const value = searchParams.get("redirect") ?? "/";
    return value.startsWith("/") ? value : "/";
  }, [searchParams]);

  useEffect(() => {
    let canceled = false;

    async function run() {
      if (!token) {
        setError("Missing assume token.");
        setStatus("error");
        return;
      }
      setStatus("loading");
      setError(null);
      try {
        setAssumeMode(true);
        const assumeAuth = getAssumeAuth();
        await signInWithCustomToken(assumeAuth, token);
        if (!canceled) {
          window.location.assign(redirectTo);
        }
      } catch (err) {
        setAssumeMode(false);
        if (!canceled) {
          setError(err instanceof Error ? err.message : "Failed to assume user.");
          setStatus("error");
        }
      }
    }

    void run();
    return () => {
      canceled = true;
    };
  }, [redirectTo, token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-black via-zinc-950 to-[#0b0b0f] px-6 text-white">
      <div className="w-full max-w-lg space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 text-center shadow-2xl">
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300">
          Admin Assume
        </div>
        <h1 className="text-2xl font-semibold text-white">Signing in as user…</h1>
        <p className="text-sm text-zinc-300">
          {status === "loading"
            ? "Preparing a user session for this tab. You can close it when you're done."
            : "Ready to continue."}
        </p>
        {status === "error" ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error ?? "Unable to assume the user."}
          </div>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            outline
            onClick={async () => {
              setAssumeMode(false);
              await signOut(getAssumeAuth());
              window.location.assign("/admin");
            }}
          >
            Exit assume mode
          </Button>
          <Button color="emerald" onClick={() => window.location.assign(redirectTo)}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AssumePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-black via-zinc-950 to-[#0b0b0f] px-6 text-white">
          <div className="text-sm text-zinc-300">Loading…</div>
        </div>
      }
    >
      <AssumeClient />
    </Suspense>
  );
}
