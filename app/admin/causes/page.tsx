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
  const [remoteMode, setRemoteMode] = useState<"custom" | "predefined">("predefined");
  const [remotePointsPerDollar, setRemotePointsPerDollar] = useState<number | "">("");
  const [remotePredefinedOptions, setRemotePredefinedOptions] = useState<
    { amountCents: number; points: number; label?: string }[]
  >([]);
  const [newRemoteOptAmount, setNewRemoteOptAmount] = useState(2);
  const [newRemoteOptPoints, setNewRemoteOptPoints] = useState(50);
  const [active, setActive] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<"basic" | "inperson" | "remote">("basic");

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
    const remoteConfig = cause?.pointsConfig?.remote;
    setRemoteMode(
      (remoteConfig?.mode as "custom" | "predefined") ??
        ((cause?.mode as "custom" | "predefined") ?? "custom"),
    );
    setRemotePointsPerDollar(
      remoteConfig?.mode === "custom" && typeof remoteConfig.pointsPerDollar === "number"
        ? remoteConfig.pointsPerDollar
        : typeof cause?.pointsPerDollar === "number"
          ? cause.pointsPerDollar
          : "",
    );
    setRemotePredefinedOptions(
      remoteConfig?.predefinedOptions ?? cause?.predefinedOptions ?? [],
    );
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
      form.append("remoteMode", remoteMode);
      form.append(
        "remotePointsPerDollar",
        remoteMode === "custom" ? String(remotePointsPerDollar || 0) : "",
      );
      form.append("remotePredefinedOptions", JSON.stringify(remotePredefinedOptions));
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
            setModalTab("basic");
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

      <div className="rounded-xl border border-white/5 bg-white/[0.02]">
        {/* Table Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-white">All Causes</h2>
              <p className="text-xs text-zinc-500">Manage charity causes and their point configurations</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5">
            <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <span className="text-sm font-medium text-zinc-400">{loading ? "Loading..." : `${causes.length} causes`}</span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Cause</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Configuration</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Coverage</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Status</th>
                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {causes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
                        <svg className="h-6 w-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                      </div>
                      <p className="mt-3 text-sm font-medium text-zinc-400">No causes yet</p>
                      <p className="mt-1 text-xs text-zinc-600">Create your first cause to get started</p>
                    </div>
                  </td>
                </tr>
              ) : (
                causes.map((cause) => {
                  const linkedCount =
                    cause.businessLinks?.reduce((sum, link) => sum + (link.locations?.length ?? 0), 0) ?? 0;
                  const businessCount = cause.businessLinks?.length ?? 0;
                  return (
                    <tr key={cause.id} className="group transition-colors hover:bg-white/[0.02]">
                      {/* Cause Info */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {cause.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={cause.imageUrl}
                              alt={cause.title}
                              className="h-10 w-10 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20">
                              <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                              </svg>
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-white">{cause.title}</div>
                            <div className="mt-0.5 max-w-xs truncate text-xs text-zinc-500">{cause.description || "No description"}</div>
                          </div>
                        </div>
                      </td>

                      {/* Configuration */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          {cause.mode === "predefined" ? (
                            <>
                              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10">
                                <svg className="h-3.5 w-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                              </div>
                              <div>
                                <div className="text-sm font-medium text-white">Predefined</div>
                                <div className="text-xs text-zinc-500">{cause.predefinedOptions?.length ?? 0} options</div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-500/10">
                                <svg className="h-3.5 w-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </div>
                              <div>
                                <div className="text-sm font-medium text-white">Custom</div>
                                <div className="text-xs text-zinc-500">{cause.pointsPerDollar ? `${cause.pointsPerDollar} pts/$` : "Flexible"}</div>
                              </div>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Coverage */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            <span className="text-sm text-white">{businessCount}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-sm text-white">{linkedCount}</span>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                            cause.active === false
                              ? "bg-red-500/10 text-red-400"
                              : "bg-emerald-500/10 text-emerald-400"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${cause.active === false ? "bg-red-400" : "bg-emerald-400"}`} />
                          {cause.active === false ? "Inactive" : "Active"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/admin/causes/${cause.id}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
                            title="View details"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </Link>
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
                            title="Edit cause"
                            onClick={() => {
                              setEditingId(cause.id);
                              setModalOpen(true);
                              setSaveMessage(null);
                              setModalTab("basic");
                            }}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <Link
                            href={`/admin/causes/${cause.id}`}
                            className="flex h-8 items-center gap-1.5 rounded-lg bg-white/5 px-3 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                            </svg>
                            QR Codes
                          </Link>
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
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur-sm">
              <div className="relative flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0f12] text-white shadow-2xl">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                      <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">{editing ? "Edit Cause" : "New Cause"}</h2>
                      <p className="text-xs text-zinc-500">{editing ? `Editing: ${editing.title}` : "Create a new charity cause"}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                    onClick={() => {
                      setModalOpen(false);
                      setSaveMessage(null);
                      setModalTab("basic");
                    }}
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b border-white/5 px-6">
                  <button
                    type="button"
                    onClick={() => setModalTab("basic")}
                    className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                      modalTab === "basic" ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Basic Info
                    </span>
                    {modalTab === "basic" && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-emerald-400" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTab("inperson")}
                    className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                      modalTab === "inperson" ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      In-Person
                    </span>
                    {modalTab === "inperson" && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-emerald-400" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTab("remote")}
                    className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                      modalTab === "remote" ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                      Remote
                    </span>
                    {modalTab === "remote" && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-emerald-400" />}
                  </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {/* Basic Info Tab */}
                  {modalTab === "basic" && (
                    <div className="space-y-5">
                      {/* Status Toggle */}
                      <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-4">
                        <div>
                          <div className="text-sm font-medium text-white">Cause Status</div>
                          <div className="text-xs text-zinc-500">Active causes are visible to users</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActive(!active)}
                          className={`relative h-6 w-11 rounded-full transition-colors ${active ? "bg-emerald-500" : "bg-zinc-700"}`}
                        >
                          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${active ? "left-[22px]" : "left-0.5"}`} />
                        </button>
                      </div>

                      {/* Title */}
                      <div>
                        <label className="block text-sm font-medium text-white">Title</label>
                        <input
                          className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-emerald-400 focus:bg-white/[0.07]"
                          placeholder="Enter cause title..."
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-sm font-medium text-white">Description</label>
                        <textarea
                          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-emerald-400 focus:bg-white/[0.07]"
                          rows={4}
                          placeholder="Describe the cause and its mission..."
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                        />
                      </div>

                      {/* Image Upload */}
                      <div>
                        <label className="block text-sm font-medium text-white">Cover Image</label>
                        <div className="mt-2">
                          {imagePreview ? (
                            <div className="group relative overflow-hidden rounded-xl border border-white/10">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={imagePreview} alt="Preview" className="aspect-video w-full object-cover" />
                              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                                <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-white/10 px-4 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-white/20">
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  Change
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0] ?? null;
                                      setImageFile(file);
                                      setImagePreview(file ? URL.createObjectURL(file) : editing?.imageUrl ?? null);
                                    }}
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setImageFile(null);
                                    setImagePreview(null);
                                  }}
                                  className="flex h-9 items-center gap-2 rounded-lg bg-red-500/20 px-4 text-xs font-medium text-red-300 backdrop-blur transition-colors hover:bg-red-500/30"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  Remove
                                </button>
                              </div>
                            </div>
                          ) : (
                            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] py-8 transition-colors hover:border-white/20 hover:bg-white/[0.04]">
                              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
                                <svg className="h-6 w-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                              <p className="mt-3 text-sm font-medium text-zinc-400">Click to upload image</p>
                              <p className="mt-1 text-xs text-zinc-600">PNG, JPG up to 10MB</p>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0] ?? null;
                                  setImageFile(file);
                                  setImagePreview(file ? URL.createObjectURL(file) : null);
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* In-Person Tab */}
                  {modalTab === "inperson" && (
                    <div className="space-y-5">
                      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
                            <svg className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-blue-300">In-Person Points</div>
                            <div className="text-xs text-blue-300/70">Configure points for QR codes printed at physical locations</div>
                          </div>
                        </div>
                      </div>

                      {/* Mode Toggle */}
                      <div>
                        <label className="block text-sm font-medium text-white">Points Mode</label>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setMode("predefined")}
                            className={`flex flex-col items-center rounded-xl border p-4 transition-all ${
                              mode === "predefined"
                                ? "border-emerald-500/50 bg-emerald-500/10"
                                : "border-white/10 bg-white/[0.02] hover:border-white/20"
                            }`}
                          >
                            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${mode === "predefined" ? "bg-emerald-500/20" : "bg-white/5"}`}>
                              <svg className={`h-5 w-5 ${mode === "predefined" ? "text-emerald-400" : "text-zinc-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                            </div>
                            <div className={`mt-2 text-sm font-medium ${mode === "predefined" ? "text-white" : "text-zinc-400"}`}>Predefined</div>
                            <div className="mt-0.5 text-xs text-zinc-500">Set fixed donation amounts</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setMode("custom")}
                            className={`flex flex-col items-center rounded-xl border p-4 transition-all ${
                              mode === "custom"
                                ? "border-emerald-500/50 bg-emerald-500/10"
                                : "border-white/10 bg-white/[0.02] hover:border-white/20"
                            }`}
                          >
                            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${mode === "custom" ? "bg-emerald-500/20" : "bg-white/5"}`}>
                              <svg className={`h-5 w-5 ${mode === "custom" ? "text-emerald-400" : "text-zinc-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </div>
                            <div className={`mt-2 text-sm font-medium ${mode === "custom" ? "text-white" : "text-zinc-400"}`}>Custom</div>
                            <div className="mt-0.5 text-xs text-zinc-500">Users enter any amount</div>
                          </button>
                        </div>
                      </div>

                      {mode === "custom" ? (
                        <div className="space-y-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-zinc-400">Points per $1</label>
                              <input
                                className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
                                type="number"
                                min="0"
                                placeholder="100"
                                value={pointsPerDollar === "" ? "" : String(pointsPerDollar)}
                                onChange={(e) => setPointsPerDollar(e.target.value === "" ? "" : Number(e.target.value))}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-zinc-400">Min ($)</label>
                              <input
                                className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
                                type="number"
                                min="0"
                                placeholder="1"
                                value={minAmountCents === "" ? "" : String((minAmountCents as number) / 100)}
                                onChange={(e) => setMinAmountCents(e.target.value === "" ? "" : Math.round(Number(e.target.value) * 100))}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-zinc-400">Max ($)</label>
                              <input
                                className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
                                type="number"
                                min="0"
                                placeholder="100"
                                value={maxAmountCents === "" ? "" : String((maxAmountCents as number) / 100)}
                                onChange={(e) => setMaxAmountCents(e.target.value === "" ? "" : Math.round(Number(e.target.value) * 100))}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Existing Options */}
                          {predefinedOptions.length > 0 && (
                            <div className="space-y-2">
                              <label className="block text-xs font-medium text-zinc-400">Current Options</label>
                              <div className="space-y-2">
                                {predefinedOptions.map((opt, idx) => (
                                  <div
                                    key={`${opt.amountCents}-${opt.points}-${opt.label ?? idx}`}
                                    className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3"
                                  >
                                    <div className="flex items-center gap-4">
                                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-sm font-bold text-emerald-400">
                                        ${(opt.amountCents / 100).toFixed(0)}
                                      </div>
                                      <div>
                                        <div className="text-sm font-medium text-white">{opt.points} points</div>
                                        <div className="text-xs text-zinc-500">{(opt.points / (opt.amountCents / 100)).toFixed(0)} pts per dollar</div>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
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
                                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                                    >
                                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Add New Option */}
                          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] p-4">
                            <label className="block text-xs font-medium text-zinc-400">Add New Option</label>
                            <div className="mt-3 flex items-end gap-3">
                              <div className="flex-1">
                                <label className="block text-xs text-zinc-500">Amount ($)</label>
                                <input
                                  className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
                                  type="number"
                                  min="0.5"
                                  step="0.5"
                                  value={newOptAmount}
                                  onChange={(e) => setNewOptAmount(Number(e.target.value))}
                                />
                              </div>
                              <div className="flex-1">
                                <label className="block text-xs text-zinc-500">Points</label>
                                <input
                                  className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
                                  type="number"
                                  min="0"
                                  step="10"
                                  value={newOptPoints}
                                  onChange={(e) => setNewOptPoints(Number(e.target.value))}
                                />
                              </div>
                              <button
                                type="button"
                                className="flex h-10 items-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-400"
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
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                                Add
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Remote Tab */}
                  {modalTab === "remote" && (
                    <div className="space-y-5">
                      <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/20">
                            <svg className="h-4 w-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-purple-300">Remote Points</div>
                            <div className="text-xs text-purple-300/70">Configure points for QR codes shared online or via social media</div>
                          </div>
                        </div>
                      </div>

                      {/* Mode Toggle */}
                      <div>
                        <label className="block text-sm font-medium text-white">Points Mode</label>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setRemoteMode("predefined")}
                            className={`flex flex-col items-center rounded-xl border p-4 transition-all ${
                              remoteMode === "predefined"
                                ? "border-emerald-500/50 bg-emerald-500/10"
                                : "border-white/10 bg-white/[0.02] hover:border-white/20"
                            }`}
                          >
                            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${remoteMode === "predefined" ? "bg-emerald-500/20" : "bg-white/5"}`}>
                              <svg className={`h-5 w-5 ${remoteMode === "predefined" ? "text-emerald-400" : "text-zinc-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                            </div>
                            <div className={`mt-2 text-sm font-medium ${remoteMode === "predefined" ? "text-white" : "text-zinc-400"}`}>Predefined</div>
                            <div className="mt-0.5 text-xs text-zinc-500">Set fixed donation amounts</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemoteMode("custom")}
                            className={`flex flex-col items-center rounded-xl border p-4 transition-all ${
                              remoteMode === "custom"
                                ? "border-emerald-500/50 bg-emerald-500/10"
                                : "border-white/10 bg-white/[0.02] hover:border-white/20"
                            }`}
                          >
                            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${remoteMode === "custom" ? "bg-emerald-500/20" : "bg-white/5"}`}>
                              <svg className={`h-5 w-5 ${remoteMode === "custom" ? "text-emerald-400" : "text-zinc-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </div>
                            <div className={`mt-2 text-sm font-medium ${remoteMode === "custom" ? "text-white" : "text-zinc-400"}`}>Custom</div>
                            <div className="mt-0.5 text-xs text-zinc-500">Users enter any amount</div>
                          </button>
                        </div>
                      </div>

                      {remoteMode === "custom" ? (
                        <div className="space-y-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                          <div>
                            <label className="block text-xs font-medium text-zinc-400">Points per $1</label>
                            <input
                              className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
                              type="number"
                              min="0"
                              placeholder="100"
                              value={remotePointsPerDollar === "" ? "" : String(remotePointsPerDollar)}
                              onChange={(e) =>
                                setRemotePointsPerDollar(
                                  e.target.value === "" ? "" : Number(e.target.value),
                                )
                              }
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Existing Options */}
                          {remotePredefinedOptions.length > 0 && (
                            <div className="space-y-2">
                              <label className="block text-xs font-medium text-zinc-400">Current Options</label>
                              <div className="space-y-2">
                                {remotePredefinedOptions.map((opt, idx) => (
                                  <div
                                    key={`${opt.amountCents}-${opt.points}-${opt.label ?? idx}`}
                                    className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3"
                                  >
                                    <div className="flex items-center gap-4">
                                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 text-sm font-bold text-purple-400">
                                        ${(opt.amountCents / 100).toFixed(0)}
                                      </div>
                                      <div>
                                        <div className="text-sm font-medium text-white">{opt.points} points</div>
                                        <div className="text-xs text-zinc-500">{(opt.points / (opt.amountCents / 100)).toFixed(0)} pts per dollar</div>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setRemotePredefinedOptions((prev) =>
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
                                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                                    >
                                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Add New Option */}
                          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] p-4">
                            <label className="block text-xs font-medium text-zinc-400">Add New Option</label>
                            <div className="mt-3 flex items-end gap-3">
                              <div className="flex-1">
                                <label className="block text-xs text-zinc-500">Amount ($)</label>
                                <input
                                  className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
                                  type="number"
                                  min="0.5"
                                  step="0.5"
                                  value={newRemoteOptAmount}
                                  onChange={(e) => setNewRemoteOptAmount(Number(e.target.value))}
                                />
                              </div>
                              <div className="flex-1">
                                <label className="block text-xs text-zinc-500">Points</label>
                                <input
                                  className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
                                  type="number"
                                  min="0"
                                  step="10"
                                  value={newRemoteOptPoints}
                                  onChange={(e) => setNewRemoteOptPoints(Number(e.target.value))}
                                />
                              </div>
                              <button
                                type="button"
                                className="flex h-10 items-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-400"
                                onClick={() =>
                                  setRemotePredefinedOptions((prev) => [
                                    ...prev,
                                    {
                                      amountCents: Math.round(newRemoteOptAmount * 100),
                                      points: Math.round(newRemoteOptPoints),
                                      label: `$${newRemoteOptAmount.toFixed(2)} → ${newRemoteOptPoints} pts`,
                                    },
                                  ])
                                }
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                                Add
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-between border-t border-white/5 px-6 py-4">
                  <div>
                    {editing ? (
                      <button
                        type="button"
                        className="flex h-10 items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                        onClick={deleteCause}
                        disabled={deleting || saving}
                      >
                        {deleting ? (
                          <>
                            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Deleting...
                          </>
                        ) : (
                          <>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete
                          </>
                        )}
                      </button>
                    ) : (
                      <div />
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {saveMessage && (
                      <span className={`text-xs ${saveMessage.includes("Failed") ? "text-red-400" : "text-emerald-400"}`}>
                        {saveMessage}
                      </span>
                    )}
                    <button
                      type="button"
                      className="h-10 rounded-lg border border-white/10 px-4 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                      onClick={() => {
                        setModalOpen(false);
                        setSaveMessage(null);
                        setModalTab("basic");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="flex h-10 items-center gap-2 rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:opacity-50"
                      onClick={saveCause}
                      disabled={saving || deleting}
                    >
                      {saving ? (
                        <>
                          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Saving...
                        </>
                      ) : editing ? (
                        "Update Cause"
                      ) : (
                        "Create Cause"
                      )}
                    </button>
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
