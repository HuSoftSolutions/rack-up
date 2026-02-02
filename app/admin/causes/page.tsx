"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { CauseDoc } from "@/lib/types/business";

type CauseRow = (CauseDoc & { id: string }) & {
  businessLinks?: {
    businessId: string;
    businessName: string;
    businessSlug: string;
    locations: { id: string; slug: string; name?: string }[];
  }[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

function formatMoney(cents?: number | null) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminCausesPage() {
  const { user } = useAuth();
  const [causes, setCauses] = useState<CauseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // form
  const editing = useMemo(() => causes.find((c) => c.id === editingId) ?? null, [causes, editingId]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"custom" | "predefined">("custom");
  const [pointsPerDollar, setPointsPerDollar] = useState<number | "">("");
  const [minAmountCents, setMinAmountCents] = useState<number | "">("");
  const [maxAmountCents, setMaxAmountCents] = useState<number | "">("");
  const [predefinedOptions, setPredefinedOptions] = useState<
    { amountCents: number; points: number; label?: string }[]
  >([]);
  const [newOptAmount, setNewOptAmount] = useState(10);
  const [newOptPoints, setNewOptPoints] = useState(500);
  const [active, setActive] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = causes.length;
    const activeCauses = causes.filter((c) => c.active !== false).length;
    const inactive = causes.filter((c) => c.active === false).length;
    const linkedLocations = causes.reduce(
      (sum, c) =>
        sum + (c.businessLinks?.reduce((s, link) => s + (link.locations?.length ?? 0), 0) ?? 0),
      0,
    );
    return { total, activeCauses, inactive, linkedLocations };
  }, [causes]);

  function resetForm(cause?: CauseRow | null) {
    setTitle(cause?.title ?? "");
    setDescription(cause?.description ?? "");
    setMode((cause?.mode as "custom" | "predefined") ?? "custom");
    setPointsPerDollar(
      cause?.mode === "custom" && typeof cause?.pointsPerDollar === "number" ? cause.pointsPerDollar : "",
    );
    setMinAmountCents(
      cause?.mode === "custom" && typeof cause?.minAmountCents === "number" ? cause.minAmountCents : "",
    );
    setMaxAmountCents(
      cause?.mode === "custom" && typeof cause?.maxAmountCents === "number" ? cause.maxAmountCents : "",
    );
    setPredefinedOptions(cause?.predefinedOptions ?? []);
    setActive(cause?.active ?? true);
    setImageFile(null);
    setImagePreview(cause?.imageUrl ?? null);
  }

  const loadCauses = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/causes", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = (await res.json()) as { causes?: CauseRow[]; error?: string };
      if (!res.ok || !json.causes) throw new Error(json.error ?? "Failed to load causes.");
      setCauses(json.causes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load causes.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadCauses();
  }, [loadCauses]);

  useEffect(() => {
    resetForm(editing);
  }, [editing]);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function saveCause() {
    if (!user) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const idToken = await user.getIdToken();
      const form = new FormData();
      if (editing && editingId) form.append("id", editingId);
      form.append("title", title);
      form.append("description", description);
      form.append("mode", mode);
      form.append("pointsPerDollar", mode === "custom" ? String(pointsPerDollar || 0) : "");
      form.append("minAmountCents", mode === "custom" ? String(minAmountCents || "") : "");
      form.append("maxAmountCents", mode === "custom" ? String(maxAmountCents || "") : "");
      form.append("predefinedOptions", JSON.stringify(predefinedOptions));
      form.append("active", active ? "true" : "false");
      if (imageFile) form.append("image", imageFile);

      const method = editing ? "PATCH" : "POST";
      const res = await fetch("/api/admin/causes", {
        method,
        headers: { Authorization: `Bearer ${idToken}` },
        body: form,
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; id?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to save cause.");
      await loadCauses();
      setEditingId(editing ? editingId : json.id ?? null);
      setSaveMessage("Saved.");
      setModalOpen(false);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCause() {
    if (!user || !editingId) return;
    setDeleting(true);
    setSaveMessage(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/causes", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ id: editingId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to delete cause.");
      await loadCauses();
      setEditingId(null);
      setModalOpen(false);
      setSaveMessage("Deleted.");
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading && causes.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-zinc-400">Loading&hellip;</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Admin</p>
          <h1 className="text-2xl font-bold tracking-tight text-white">Rack Up Causes</h1>
          <p className="mt-1 text-sm text-zinc-500">
            All public-facing causes. Manage them here and assign them to businesses in the Businesses page.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            resetForm(null);
            setModalOpen(true);
            setSaveMessage(null);
          }}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white hover:bg-emerald-400"
        >
          + New Cause
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total causes</div>
          <div className="mt-1 text-2xl font-bold text-white">{stats.total}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Active</div>
          <div className="mt-1 text-2xl font-bold text-white">{stats.activeCauses}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Inactive</div>
          <div className="mt-1 text-2xl font-bold text-white">{stats.inactive}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Linked locations</div>
          <div className="mt-1 text-2xl font-bold text-white">{stats.linkedLocations}</div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.02]">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
          <div className="font-semibold text-white">All causes</div>
          <div className="text-xs text-zinc-500">{loading ? "Loading\u2026" : `${causes.length} causes`}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-white/[0.02] text-left text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Points / $</th>
                <th className="px-4 py-3">Linked locations</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {causes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-zinc-400">
                    No causes yet.
                  </td>
                </tr>
              ) : (
                causes.map((cause) => {
                  const linkedCount =
                    cause.businessLinks?.reduce((sum, link) => sum + (link.locations?.length ?? 0), 0) ?? 0;
                  return (
                    <tr key={cause.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{cause.title}</div>
                        <div className="text-xs text-zinc-400 line-clamp-2">{cause.description}</div>
                      </td>
                      <td className="px-4 py-3 capitalize text-white">{cause.mode}</td>
                      <td className="px-4 py-3 text-white">
                        {cause.mode === "predefined"
                          ? "Predefined options"
                          : cause.pointsPerDollar
                            ? `${cause.pointsPerDollar} pts`
                            : "—"}
                      </td>
                      <td className="px-4 py-3 text-white">{linkedCount}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            cause.active === false
                              ? "bg-red-500/15 text-red-300"
                              : "bg-emerald-400/15 text-emerald-300"
                          }`}
                        >
                          {cause.active === false ? "Inactive" : "Active"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link
                            href={`/admin/causes/${cause.id}`}
                            className="text-xs font-semibold text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
                          >
                            View details
                          </Link>
                          <button
                            type="button"
                            className="text-xs font-semibold text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
                            onClick={() => {
                              setEditingId(cause.id);
                              setModalOpen(true);
                              setSaveMessage(null);
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && mounted
        ? createPortal(
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 py-12">
              <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0f1217] p-6 text-white shadow-2xl">
                <button
                  type="button"
                  className="absolute right-4 top-4 text-xs text-zinc-400 hover:text-white"
                  onClick={() => {
                    setModalOpen(false);
                    setSaveMessage(null);
                  }}
                >
                  Close
                </button>
                <div className="mb-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {editing ? "Edit cause" : "New cause"}
                  </div>
                  <div className="text-xl font-semibold">{editing ? editing.title : "Create cause"}</div>
                </div>

                <div className="space-y-3 text-sm">
                  <label className="block">
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Title</div>
                    <input
                      className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>

                  <label className="block">
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Description</div>
                    <textarea
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>

                  <div className="space-y-2 text-sm">
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Image</div>
                    {imagePreview ? (
                      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imagePreview} alt="Preview" className="h-32 w-full object-cover" />
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-3 text-xs text-zinc-400">
                        No image selected.
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setImageFile(file);
                        setImagePreview(file ? URL.createObjectURL(file) : editing?.imageUrl ?? null);
                      }}
                    />
                  </div>

                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Mode</div>
                  <div className="flex items-center gap-3 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="mode"
                        value="custom"
                        checked={mode === "custom"}
                        onChange={() => setMode("custom")}
                      />
                      Custom
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="mode"
                        value="predefined"
                        checked={mode === "predefined"}
                        onChange={() => setMode("predefined")}
                      />
                      Predefined
                    </label>
                  </div>

                  {mode === "custom" ? (
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Points per $</span>
                        <input
                          className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
                          type="number"
                          min="0"
                          value={pointsPerDollar === "" ? "" : String(pointsPerDollar)}
                          onChange={(e) => setPointsPerDollar(e.target.value === "" ? "" : Number(e.target.value))}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Min amount (cents)</span>
                        <input
                          className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
                          type="number"
                          min="0"
                          value={minAmountCents === "" ? "" : String(minAmountCents)}
                          onChange={(e) => setMinAmountCents(e.target.value === "" ? "" : Number(e.target.value))}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Max amount (cents)</span>
                        <input
                          className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
                          type="number"
                          min="0"
                          value={maxAmountCents === "" ? "" : String(maxAmountCents)}
                          onChange={(e) => setMaxAmountCents(e.target.value === "" ? "" : Number(e.target.value))}
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-2 text-sm">
                      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Predefined options</div>
                      <div className="flex flex-wrap gap-2">
                        {predefinedOptions.map((opt) => (
                          <span
                            key={`${opt.amountCents}-${opt.points}-${opt.label ?? "opt"}`}
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white"
                          >
                            {opt.label ?? `${formatMoney(opt.amountCents)} → ${opt.points} pts`}
                            <button
                              type="button"
                              className="text-red-400"
                              onClick={() =>
                                setPredefinedOptions((prev) =>
                                  prev.filter(
                                    (p) =>
                                      !(
                                        p.amountCents === opt.amountCents &&
                                        p.points === opt.points &&
                                        p.label === opt.label
                                      ),
                                  ),
                                )
                              }
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <label className="flex flex-col gap-1">
                          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Amount (USD)</span>
                          <input
                            className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
                            type="number"
                            min="0.5"
                            step="0.5"
                            value={newOptAmount}
                            onChange={(e) => setNewOptAmount(Number(e.target.value))}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Points</span>
                          <input
                            className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
                            type="number"
                            min="0"
                            step="10"
                            value={newOptPoints}
                            onChange={(e) => setNewOptPoints(Number(e.target.value))}
                          />
                        </label>
                        <div className="flex items-end">
                          <button
                            type="button"
                            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-white hover:bg-emerald-400"
                            onClick={() =>
                              setPredefinedOptions((prev) => [
                                ...prev,
                                {
                                  amountCents: Math.round(newOptAmount * 100),
                                  points: Math.round(newOptPoints),
                                  label: `$${newOptAmount.toFixed(2)} → ${newOptPoints} pts`,
                                },
                              ])
                            }
                          >
                            Add option
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                    <span>Active</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60"
                      onClick={saveCause}
                      disabled={saving || deleting}
                    >
                      {saving ? "Saving\u2026" : editing ? "Update cause" : "Create cause"}
                    </button>
                    {editing ? (
                      <button
                        type="button"
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-red-400/40 bg-red-500/10 px-5 text-sm font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-60"
                        onClick={deleteCause}
                        disabled={deleting || saving}
                      >
                        {deleting ? "Deleting\u2026" : "Delete cause"}
                      </button>
                    ) : null}
                    {saveMessage ? <span className="text-xs text-zinc-400">{saveMessage}</span> : null}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
