"use client";

import { useEffect } from "react";
import { logClientError } from "@/lib/client/error-logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void logClientError({
      kind: "manual",
      message: error.message || "Unhandled global error",
      name: error.name,
      stack: error.stack ?? null,
      extra: { digest: error.digest ?? null },
    });
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-gradient-to-b from-black via-zinc-950 to-[#0b0b0f] text-white">
        <div className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center p-6">
          <div className="w-full rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
            <h2 className="text-xl font-semibold">Application issue detected</h2>
            <p className="mt-2 text-sm text-red-100">
              We logged this issue. Please retry now.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => reset()}
                className="rounded-lg border border-white/20 px-3 py-2 text-sm"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg bg-white/15 px-3 py-2 text-sm"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
