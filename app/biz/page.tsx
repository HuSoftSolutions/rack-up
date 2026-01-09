"use client";

import { useRouter } from "next/navigation";
import React, { useEffect } from "react";
import { useBusinessAccess } from "@/lib/auth/business";

export default function BizRootRedirect() {
  const router = useRouter();
  const { membership, loading } = useBusinessAccess();

  useEffect(() => {
    if (loading) return;
    if (membership?.businessId) {
      router.replace(`/biz/${membership.businessId}`);
    }
  }, [loading, membership, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-black">
        <div className="text-sm text-zinc-600 dark:text-zinc-400">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 text-center text-sm text-zinc-700 shadow-sm dark:border-white/10 dark:bg-black dark:text-zinc-200">
        <div className="text-base font-semibold">No business access</div>
        <div className="mt-2 text-zinc-600 dark:text-zinc-400">
          Your account is not linked to a business console yet.
        </div>
      </div>
    </div>
  );
}
