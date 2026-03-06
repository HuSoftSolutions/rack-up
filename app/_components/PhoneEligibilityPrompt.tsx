"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

export default function PhoneEligibilityPrompt() {
  const { user, loading } = useAuth();
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shouldCheck = useMemo(() => !loading && Boolean(user), [loading, user]);

  useEffect(() => {
    if (!shouldCheck || !user) return;
    let cancelled = false;
    setChecking(true);
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/users/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json()) as { phoneNumber?: string | null };
        if (cancelled) return;
        const existing = typeof json.phoneNumber === "string" ? json.phoneNumber : "";
        setPhone(existing);
        setOpen(!existing);
      } catch {
        if (!cancelled) setOpen(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shouldCheck, user]);

  async function savePhone() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save phone number.");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save phone number.");
    } finally {
      setSaving(false);
    }
  }

  if (!open || checking) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f1217] p-6 text-white shadow-2xl">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Community drawing eligibility</div>
        <div className="mt-1 text-xl font-semibold">Add your phone number</div>
        <p className="mt-2 text-sm text-zinc-300">
          A phone number is required so we can contact community drawing winners quickly.
        </p>

        <label className="mt-4 block">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Phone number</div>
          <input
            className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 555-5555"
          />
        </label>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60"
            onClick={savePhone}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save phone"}
          </button>
        </div>
      </div>
    </div>
  );
}
