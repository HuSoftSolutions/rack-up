"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import Select, { type StylesConfig } from "react-select";

type Giveaway = {
  id: string;
  title: string;
  description?: string;
  status?: "draft" | "active" | "closed" | "drawn";
  winner?: {
    userId?: string;
    entryId?: string;
    donationId?: string;
    donorName?: string | null;
    donorEmail?: string | null;
    phoneNumber?: string | null;
    amountCents?: number | null;
    causeTitle?: string | null;
    drawnAt?: string;
  } | null;
  eligibility?: {
    matchMode?: "all" | "any";
    causeIds?: string[];
    businessIds?: string[];
    locationIds?: string[];
    scanSources?: ("in_person" | "remote")[];
  } | null;
  entryConfig?: {
    entryUnitPoints?: number;
    entryMultiplier?: {
      inPerson?: number;
      remote?: number;
    };
  } | null;
  prize?: {
    name?: string;
    value?: string;
    imageUrl?: string;
    description?: string;
  } | null;
};

type GiveawayEntry = {
  id: string;
  giveawayId: string;
  donationId: string | null;
  userId: string | null;
  entriesCount: number;
  scanSource: string | null;
  amountCents: number | null;
  createdAt: string | null;
};

type GiveawayEvent = {
  id: string;
  giveawayId: string;
  type: string;
  actorUserId: string | null;
  at: string | null;
  payload: unknown;
};

type Option = { value: string; label: string };

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatMoney(cents?: number | null) {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatCurrencyInput(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return "";
  const [wholeRaw, decimalRaw = ""] = cleaned.split(".", 2);
  const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0";
  const withCommas = Number.parseInt(whole, 10).toLocaleString("en-US");
  const decimal = decimalRaw.slice(0, 2);
  if (cleaned.endsWith(".") && !decimal.length) return `$${withCommas}.`;
  if (decimal.length > 0) return `$${withCommas}.${decimal}`;
  return `$${withCommas}`;
}

function eligibilitySummary(giveaway: Giveaway) {
  const eligibility = giveaway.eligibility;
  if (!eligibility) return "Open to all donations.";
  const parts: string[] = [];
  if (eligibility.causeIds?.length) parts.push(`causes: ${eligibility.causeIds.join(", ")}`);
  if (eligibility.businessIds?.length) parts.push(`businesses: ${eligibility.businessIds.join(", ")}`);
  if (eligibility.locationIds?.length) parts.push(`locations: ${eligibility.locationIds.join(", ")}`);
  if (eligibility.scanSources?.length) parts.push(`sources: ${eligibility.scanSources.join(", ")}`);
  if (parts.length === 0) return "Open to all donations.";
  const mode = eligibility.matchMode === "any" ? "ANY" : "ALL";
  const entryUnitPoints = giveaway.entryConfig?.entryUnitPoints ?? 500;
  const inPersonMultiplier = giveaway.entryConfig?.entryMultiplier?.inPerson ?? 1;
  const remoteMultiplier = giveaway.entryConfig?.entryMultiplier?.remote ?? 1;
  return `${mode} of ${parts.join(" • ")} · ${entryUnitPoints} pts/entry · x${inPersonMultiplier} in-person · x${remoteMultiplier} remote`;
}

function GiveawayImageThumb({ imageUrl, title }: { imageUrl?: string; title: string }) {
  if (imageUrl) {
    return (
      <div className="h-12 w-12 overflow-hidden rounded-md border border-white/10 bg-white/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={`${title} prize`} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-white/15 bg-white/5 text-center text-[10px] font-semibold uppercase leading-tight tracking-wide text-zinc-500">
      No image
    </div>
  );
}

const multiSelectStyles: StylesConfig<Option, true> = {
  control: (base) => ({
    ...base,
    minHeight: 40,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.1)",
    boxShadow: "none",
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: "#0f1217",
    border: "1px solid rgba(255,255,255,0.1)",
  }),
  menuPortal: (base) => ({ ...base, zIndex: 120 }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? "rgba(16,185,129,0.2)" : "#0f1217",
    color: "#fff",
  }),
  multiValue: (base) => ({
    ...base,
    backgroundColor: "rgba(16,185,129,0.2)",
  }),
  multiValueLabel: (base) => ({ ...base, color: "#d1fae5" }),
  input: (base) => ({ ...base, color: "#fff" }),
  placeholder: (base) => ({ ...base, color: "rgba(255,255,255,0.5)" }),
  singleValue: (base) => ({ ...base, color: "#fff" }),
};

export default function AdminGiveawaysPage() {
  const { user } = useAuth();
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [entriesOpen, setEntriesOpen] = useState(false);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [entries, setEntries] = useState<GiveawayEntry[]>([]);
  const [entriesTotal, setEntriesTotal] = useState<number>(0);
  const [entriesGiveaway, setEntriesGiveaway] = useState<Giveaway | null>(null);
  const [entriesSource, setEntriesSource] = useState<"all" | "in_person" | "remote">("all");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<GiveawayEvent[]>([]);
  const [historyGiveaway, setHistoryGiveaway] = useState<Giveaway | null>(null);
  const [pendingStatuses, setPendingStatuses] = useState<Array<"draft" | "active" | "closed" | "drawn">>([
    "draft",
    "active",
    "closed",
  ]);
  const [causeOptions, setCauseOptions] = useState<Option[]>([]);
  const [businessOptions, setBusinessOptions] = useState<Option[]>([]);
  const [locationOptions, setLocationOptions] = useState<Option[]>([]);

  const editing = useMemo(
    () => giveaways.find((g) => g.id === editingId) ?? null,
    [editingId, giveaways],
  );

  const pendingGiveaways = useMemo(() => {
    return giveaways.filter((g) => {
      const hasWinner = Boolean(g.winner?.userId || g.winner?.donationId);
      if (hasWinner) return false;
      const giveawayStatus = (g.status ?? "draft") as "draft" | "active" | "closed" | "drawn";
      return pendingStatuses.includes(giveawayStatus);
    });
  }, [giveaways, pendingStatuses]);

  const decidedGiveaways = useMemo(() => {
    return giveaways.filter((g) => Boolean(g.winner?.userId || g.winner?.donationId));
  }, [giveaways]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"draft" | "active" | "closed" | "drawn">("draft");
  const [matchMode, setMatchMode] = useState<"all" | "any">("all");
  const [selectedCauseIds, setSelectedCauseIds] = useState<string[]>([]);
  const [selectedBusinessIds, setSelectedBusinessIds] = useState<string[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [sourceInPerson, setSourceInPerson] = useState(false);
  const [sourceRemote, setSourceRemote] = useState(false);
  const [entryUnitPoints, setEntryUnitPoints] = useState("500");
  const [inPersonEntryMultiplier, setInPersonEntryMultiplier] = useState("1");
  const [remoteEntryMultiplier, setRemoteEntryMultiplier] = useState("1");
  const [prizeName, setPrizeName] = useState("");
  const [prizeValue, setPrizeValue] = useState("");
  const [prizeImageUrl, setPrizeImageUrl] = useState("");
  const [prizeImageFile, setPrizeImageFile] = useState<File | null>(null);
  const [prizeImageUploading, setPrizeImageUploading] = useState(false);
  const [prizeImageMessage, setPrizeImageMessage] = useState<string | null>(null);
  const [prizeDescription, setPrizeDescription] = useState("");

  function resetForm(giveaway?: Giveaway | null) {
    setTitle(giveaway?.title ?? "");
    setDescription(giveaway?.description ?? "");
    setStatus(giveaway?.status ?? "draft");
    setMatchMode(giveaway?.eligibility?.matchMode === "any" ? "any" : "all");
    setSelectedCauseIds(giveaway?.eligibility?.causeIds ?? []);
    setSelectedBusinessIds(giveaway?.eligibility?.businessIds ?? []);
    setSelectedLocationIds(giveaway?.eligibility?.locationIds ?? []);
    setSourceInPerson(Boolean(giveaway?.eligibility?.scanSources?.includes("in_person")));
    setSourceRemote(Boolean(giveaway?.eligibility?.scanSources?.includes("remote")));
    setEntryUnitPoints(String(giveaway?.entryConfig?.entryUnitPoints ?? 500));
    setInPersonEntryMultiplier(String(giveaway?.entryConfig?.entryMultiplier?.inPerson ?? 1));
    setRemoteEntryMultiplier(String(giveaway?.entryConfig?.entryMultiplier?.remote ?? 1));
    setPrizeName(giveaway?.prize?.name ?? "");
    setPrizeValue(giveaway?.prize?.value ?? "");
    setPrizeImageUrl(giveaway?.prize?.imageUrl ?? "");
    setPrizeImageFile(null);
    setPrizeImageUploading(false);
    setPrizeImageMessage(null);
    setPrizeDescription(giveaway?.prize?.description ?? "");
  }

  async function loadGiveaways() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      if ((prizeValue.trim() || prizeImageUrl.trim() || prizeDescription.trim()) && !prizeName.trim()) {
        throw new Error("Giveaway item name is required when item details are provided.");
      }
      const idToken = await user.getIdToken();
      const [giveawaysRes, causesRes, entitiesRes] = await Promise.all([
        fetch("/api/admin/giveaways", {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
        fetch("/api/admin/causes", {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
        fetch("/api/admin/entities", {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      ]);

      const giveawaysJson = (await giveawaysRes.json()) as { giveaways?: Giveaway[]; error?: string };
      if (!giveawaysRes.ok || !giveawaysJson.giveaways) {
        throw new Error(giveawaysJson.error ?? "Failed to load giveaways.");
      }
      setGiveaways(giveawaysJson.giveaways);

      const causesJson = (await causesRes.json()) as {
        causes?: Array<{ id: string; title?: string }>;
      };
      const entitiesJson = (await entitiesRes.json()) as {
        businesses?: Array<{
          id: string;
          name?: string;
          locations?: Array<{ id: string; name?: string }>;
        }>;
      };

      if (causesRes.ok && Array.isArray(causesJson.causes)) {
        setCauseOptions(
          causesJson.causes
            .map((cause) => ({ value: cause.id, label: cause.title ?? cause.id }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        );
      }
      if (entitiesRes.ok && Array.isArray(entitiesJson.businesses)) {
        const businessOpts = entitiesJson.businesses
          .map((biz) => ({ value: biz.id, label: biz.name ?? biz.id }))
          .sort((a, b) => a.label.localeCompare(b.label));
        setBusinessOptions(businessOpts);

        const locationOpts: Option[] = [];
        entitiesJson.businesses.forEach((biz) => {
          (biz.locations ?? []).forEach((loc) => {
            locationOpts.push({
              value: loc.id,
              label: `${biz.name ?? biz.id} · ${loc.name ?? loc.id}`,
            });
          });
        });
        locationOpts.sort((a, b) => a.label.localeCompare(b.label));
        setLocationOptions(locationOpts);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load giveaways.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadGiveaways();
    // loadGiveaways intentionally depends only on auth state for initial/admin refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    resetForm(editing);
  }, [editing]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!sourceRemote) return;
    setSelectedBusinessIds([]);
    setSelectedLocationIds([]);
  }, [sourceRemote]);

  async function uploadPrizeImage() {
    if (!user) {
      setPrizeImageMessage("You must be signed in.");
      return;
    }
    if (!prizeImageFile) {
      setPrizeImageMessage("Choose an image file first.");
      return;
    }
    setPrizeImageUploading(true);
    setPrizeImageMessage(null);
    try {
      const idToken = await user.getIdToken();
      const formData = new FormData();
      formData.append("image", prizeImageFile);
      if (editingId) formData.append("giveawayId", editingId);
      const res = await fetch("/api/admin/giveaways/upload-image", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });
      const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Failed to upload image.");
      setPrizeImageUrl(json.url);
      setPrizeImageMessage("Image uploaded.");
      setPrizeImageFile(null);
    } catch (err) {
      setPrizeImageMessage(err instanceof Error ? err.message : "Failed to upload image.");
    } finally {
      setPrizeImageUploading(false);
    }
  }

  async function saveGiveaway() {
    if (!user) return;
    if (prizeImageUploading) {
      setActionMessage("Please wait for image upload to finish.");
      return;
    }
    if (prizeImageFile) {
      setActionMessage("Upload the selected image before saving.");
      return;
    }
    setSaving(true);
    setActionMessage(null);
    try {
      const unit = Math.max(1, Math.floor(Number(entryUnitPoints) || 500));
      const inPersonMultiplier = Math.max(1, Math.floor(Number(inPersonEntryMultiplier) || 1));
      const remoteMultiplier = Math.max(1, Math.floor(Number(remoteEntryMultiplier) || 1));
      const idToken = await user.getIdToken();
      const payload = {
        title,
        description,
        status,
        eligibility: {
          matchMode,
          causeIds: selectedCauseIds,
          businessIds: sourceRemote ? [] : selectedBusinessIds,
          locationIds: sourceRemote ? [] : selectedLocationIds,
          scanSources: [
              ...(sourceInPerson ? (["in_person"] as const) : []),
              ...(sourceRemote ? (["remote"] as const) : []),
          ],
        },
        entryConfig: {
          entryUnitPoints: unit,
          entryMultiplier: {
            inPerson: inPersonMultiplier,
            remote: remoteMultiplier,
          },
        },
        prize: {
          name: prizeName.trim(),
          value: prizeValue.trim(),
          imageUrl: prizeImageUrl.trim(),
          description: prizeDescription.trim(),
        },
      };
      const res = await fetch("/api/admin/giveaways", {
        method: editing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(editing ? { id: editingId, ...payload } : payload),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Failed to save giveaway.");
      await loadGiveaways();
      setModalOpen(false);
      setActionMessage("Saved.");
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Failed to save giveaway.");
    } finally {
      setSaving(false);
    }
  }

async function drawWinner(id: string) {
    if (!user) return;
    setActionMessage(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin/giveaways/${id}/draw`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        winner?: { userId?: string; donationId?: string; donorName?: string | null };
      };
      if (!res.ok || json.error) throw new Error(json.error ?? "Failed to draw winner.");
      await loadGiveaways();
      const winnerLabel =
        json.winner?.donorName ?? json.winner?.userId ?? json.winner?.donationId ?? "winner selected";
      setActionMessage(`Winner drawn: ${winnerLabel}.`);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Failed to draw winner.");
    }
  }

  const loadEntries = useCallback(
    async (giveawayId: string) => {
      if (!user) return;
      setEntriesLoading(true);
      setEntriesError(null);
      try {
        const idToken = await user.getIdToken();
        const params = new URLSearchParams();
        params.set("limit", "1000");
        if (entriesSource !== "all") params.set("scanSource", entriesSource);
        const res = await fetch(`/api/admin/giveaways/${giveawayId}/entries?${params.toString()}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as { entries?: GiveawayEntry[]; totalEntries?: number; error?: string };
        if (!res.ok || !json.entries) throw new Error(json.error ?? "Failed to load entries.");
        setEntries(json.entries);
        setEntriesTotal(json.totalEntries ?? 0);
      } catch (err) {
        setEntriesError(err instanceof Error ? err.message : "Failed to load entries.");
      } finally {
        setEntriesLoading(false);
      }
    },
    [entriesSource, user],
  );

  const loadHistory = useCallback(
    async (giveawayId: string) => {
      if (!user) return;
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const idToken = await user.getIdToken();
        const res = await fetch(`/api/admin/giveaways/${giveawayId}/events?limit=500`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as { events?: GiveawayEvent[]; error?: string };
        if (!res.ok || !json.events) throw new Error(json.error ?? "Failed to load history.");
        setHistoryItems(json.events);
      } catch (err) {
        setHistoryError(err instanceof Error ? err.message : "Failed to load history.");
      } finally {
        setHistoryLoading(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (!entriesOpen || !entriesGiveaway) return;
    void loadEntries(entriesGiveaway.id);
  }, [entriesOpen, entriesGiveaway, loadEntries]);

  useEffect(() => {
    if (!historyOpen || !historyGiveaway) return;
    void loadHistory(historyGiveaway.id);
  }, [historyOpen, historyGiveaway, loadHistory]);

  function downloadEntriesCsv() {
    if (!entriesGiveaway || entries.length === 0) return;
    const headers = [
      "Entry ID",
      "Giveaway ID",
      "Donation ID",
      "User ID",
      "Entries",
      "Scan Source",
      "Amount Cents",
      "Created At",
    ];
    const rows = entries.map((row) => [
      row.id,
      row.giveawayId,
      row.donationId ?? "",
      row.userId ?? "",
      String(row.entriesCount ?? 0),
      row.scanSource ?? "",
      row.amountCents ?? "",
      row.createdAt ?? "",
    ]);
    const content = [headers, ...rows]
      .map((line) =>
        line
          .map((value) => {
            const text = String(value);
            if (text.includes(",") || text.includes("\n") || text.includes("\"")) {
              return `"${text.replace(/"/g, "\"\"")}"`;
            }
            return text;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `giveaway-${entriesGiveaway.id}-entries.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function togglePendingStatus(statusValue: "draft" | "active" | "closed" | "drawn") {
    setPendingStatuses((prev) =>
      prev.includes(statusValue) ? prev.filter((item) => item !== statusValue) : [...prev, statusValue],
    );
  }

  return (
    <div className="space-y-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Admin</p>
          <h1 className="text-2xl font-bold tracking-tight text-white">Giveaways</h1>
          <p className="mt-1 text-sm text-zinc-500">Create and manage global giveaways.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            resetForm(null);
            setModalOpen(true);
            setActionMessage(null);
          }}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white hover:bg-emerald-400"
        >
          + New Giveaway
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {actionMessage ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-zinc-300">
          {actionMessage}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.02]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3 text-sm">
          <div>
            <div className="font-semibold text-white">Giveaways Awaiting Winner</div>
            <div className="text-xs text-zinc-500">
              {loading ? "Loading…" : `${pendingGiveaways.length} shown of ${giveaways.length} total`}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-300">
            <span className="text-zinc-500">Status filters:</span>
            {(["draft", "active", "closed", "drawn"] as const).map((statusValue) => (
              <label key={statusValue} className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={pendingStatuses.includes(statusValue)}
                  onChange={() => togglePendingStatus(statusValue)}
                />
                <span className="capitalize">{statusValue}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-white/[0.02] text-left text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-3">Image</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Winner</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingGiveaways.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-zinc-400">
                    No giveaways match the selected statuses.
                  </td>
                </tr>
              ) : (
                pendingGiveaways.map((g) => (
                  <tr key={g.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 align-top">
                      <GiveawayImageThumb imageUrl={g.prize?.imageUrl} title={g.title} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{g.title}</div>
                      <div className="text-xs text-zinc-400 line-clamp-2">{g.description}</div>
                      {g.prize?.name ? (
                        <div className="mt-1 text-xs text-emerald-200">
                          Prize: {g.prize.name}
                          {g.prize.value ? ` (${g.prize.value})` : ""}
                        </div>
                      ) : null}
                      <div className="mt-1 text-[11px] text-zinc-500">{eligibilitySummary(g)}</div>
                    </td>
                    <td className="px-4 py-3 capitalize text-white">{g.status ?? "draft"}</td>
                    <td className="px-4 py-3 text-xs text-zinc-300">
                      {g.winner?.userId ? (
                        <div className="space-y-1">
                          <div className="font-semibold text-white">
                            {g.winner.donorName ?? g.winner.userId}
                          </div>
                          {g.winner.donorEmail ? (
                            <div className="text-zinc-400">{g.winner.donorEmail}</div>
                          ) : null}
                          {g.winner.phoneNumber ? (
                            <div className="text-zinc-400">{g.winner.phoneNumber}</div>
                          ) : null}
                          {typeof g.winner.amountCents === "number" ? (
                            <div className="text-zinc-400">
                              {formatMoney(g.winner.amountCents)}{g.winner.causeTitle ? ` · ${g.winner.causeTitle}` : ""}
                            </div>
                          ) : null}
                          <div className="text-zinc-500">
                            Drawn {formatDate(g.winner.drawnAt)} · Donation {g.winner.donationId ?? "—"}
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          className="text-xs font-semibold text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
                          onClick={() => {
                            setEditingId(g.id);
                            setModalOpen(true);
                            setActionMessage(null);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold text-purple-300 underline underline-offset-2 hover:text-purple-200"
                          onClick={() => {
                            setEntriesGiveaway(g);
                            setEntriesSource("all");
                            setEntriesOpen(true);
                          }}
                        >
                          View entries
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold text-sky-300 underline underline-offset-2 hover:text-sky-200"
                          onClick={() => {
                            setHistoryGiveaway(g);
                            setHistoryOpen(true);
                          }}
                        >
                          History
                        </button>
                        <button
                          type="button"
                          className={`text-xs font-semibold underline underline-offset-2 ${
                            g.status === "active" || g.status === "closed"
                              ? "text-emerald-300 hover:text-emerald-200"
                              : "text-zinc-500 cursor-not-allowed"
                          }`}
                          onClick={() => drawWinner(g.id)}
                          disabled={!(g.status === "active" || g.status === "closed")}
                        >
                          Draw winner
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06]">
        <div className="flex items-center justify-between border-b border-emerald-400/20 px-4 py-3 text-sm">
          <div>
            <div className="font-semibold text-white">Winners Selected</div>
            <div className="text-xs text-emerald-100/70">
              {loading ? "Loading…" : `${decidedGiveaways.length} giveaway${decidedGiveaways.length === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-emerald-500/10 text-left text-xs uppercase tracking-wide text-emerald-100/90">
              <tr>
                <th className="px-4 py-3">Image</th>
                <th className="px-4 py-3">Giveaway</th>
                <th className="px-4 py-3">Winner</th>
                <th className="px-4 py-3">Donation</th>
                <th className="px-4 py-3">Drawn</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {decidedGiveaways.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-zinc-300">
                    No winners selected yet.
                  </td>
                </tr>
              ) : (
                decidedGiveaways.map((g) => (
                  <tr key={`winner-${g.id}`} className="border-t border-emerald-400/20 hover:bg-emerald-500/[0.08]">
                    <td className="px-4 py-3 align-top">
                      <GiveawayImageThumb imageUrl={g.prize?.imageUrl} title={g.title} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{g.title}</div>
                      <div className="text-xs text-zinc-300">{g.description}</div>
                      {g.prize?.name ? (
                        <div className="mt-1 text-xs text-emerald-100/90">
                          Prize: {g.prize.name}
                          {g.prize.value ? ` (${g.prize.value})` : ""}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-200">
                      <div className="space-y-1">
                        <div className="font-semibold text-white">{g.winner?.donorName ?? g.winner?.userId ?? "—"}</div>
                        {g.winner?.donorEmail ? <div>{g.winner.donorEmail}</div> : null}
                        {g.winner?.phoneNumber ? <div>{g.winner.phoneNumber}</div> : null}
                        {g.winner?.userId ? <div className="text-zinc-400">User: {g.winner.userId}</div> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-200">
                      <div className="space-y-1">
                        <div className="font-semibold text-white">{formatMoney(g.winner?.amountCents ?? null)}</div>
                        <div>{g.winner?.causeTitle ?? "—"}</div>
                        <div className="text-zinc-400">{g.winner?.donationId ?? "—"}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-100">{formatDate(g.winner?.drawnAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          className="text-xs font-semibold text-purple-300 underline underline-offset-2 hover:text-purple-200"
                          onClick={() => {
                            setEntriesGiveaway(g);
                            setEntriesSource("all");
                            setEntriesOpen(true);
                          }}
                        >
                          View entries
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold text-sky-300 underline underline-offset-2 hover:text-sky-200"
                          onClick={() => {
                            setHistoryGiveaway(g);
                            setHistoryOpen(true);
                          }}
                        >
                          History
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && mounted
        ? createPortal(
            <div
              className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-8 backdrop-blur-sm sm:py-12"
              onClick={(e) => { if (e.target === e.currentTarget) { setModalOpen(false); setActionMessage(null); } }}
            >
              <div className="w-full max-w-xl animate-in fade-in slide-in-from-bottom-4 duration-200">
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1117] shadow-2xl shadow-black/50">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-6 py-4">
                    <div>
                      <h2 className="text-lg font-semibold text-white">
                        {editing ? "Edit giveaway" : "New giveaway"}
                      </h2>
                      {editing ? (
                        <p className="mt-0.5 text-xs text-zinc-500">ID: {editingId}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
                      onClick={() => { setModalOpen(false); setActionMessage(null); }}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                  </div>

                  <div className="max-h-[calc(100vh-10rem)] overflow-y-auto">
                    <div className="space-y-6 p-6">
                      {/* Basic info */}
                      <div className="space-y-4">
                        <label className="block">
                          <span className="text-sm font-medium text-zinc-300">Title</span>
                          <input
                            className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/20"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Giveaway title"
                          />
                        </label>

                        <label className="block">
                          <span className="text-sm font-medium text-zinc-300">Description</span>
                          <textarea
                            className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/20"
                            rows={2}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description"
                          />
                        </label>

                        <label className="block">
                          <span className="text-sm font-medium text-zinc-300">Status</span>
                          <select
                            className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition focus:border-emerald-400/50"
                            value={status}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === "draft" || value === "active" || value === "closed" || value === "drawn") {
                                setStatus(value);
                              }
                            }}
                          >
                            <option value="draft">Draft</option>
                            <option value="active">Active</option>
                            <option value="closed">Closed</option>
                            <option value="drawn">Drawn</option>
                          </select>
                        </label>
                      </div>

                      {/* Prize section */}
                      <fieldset className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
                        <legend className="px-2 text-sm font-semibold text-white">Prize details</legend>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <label className="block sm:col-span-2">
                            <span className="text-sm font-medium text-zinc-300">Item name</span>
                            <input
                              className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/20"
                              value={prizeName}
                              onChange={(e) => setPrizeName(e.target.value)}
                              placeholder="e.g. TaylorMade Qi10 Driver"
                            />
                          </label>
                          <label className="block">
                            <span className="text-sm font-medium text-zinc-300">Estimated value</span>
                            <input
                              className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/20"
                              value={prizeValue}
                              onChange={(e) => setPrizeValue(formatCurrencyInput(e.target.value))}
                              inputMode="decimal"
                              placeholder="$500.00"
                            />
                          </label>
                        </div>

                        <div>
                          <span className="text-sm font-medium text-zinc-300">Image</span>
                          <div className="mt-1.5 flex items-center gap-3">
                            {prizeImageUrl ? (
                              <div className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={prizeImageUrl}
                                  alt="Giveaway item preview"
                                  className="h-20 w-20 rounded-lg border border-white/10 object-cover"
                                />
                                <button
                                  type="button"
                                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-700 text-zinc-300 hover:bg-red-500 hover:text-white"
                                  onClick={() => setPrizeImageUrl("")}
                                >
                                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                                </button>
                              </div>
                            ) : null}
                            <div className="flex-1 space-y-2">
                              <input
                                type="file"
                                accept="image/*"
                                className="w-full text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-500/20 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-emerald-300 hover:file:bg-emerald-500/30"
                                onChange={(e) => setPrizeImageFile(e.target.files?.[0] ?? null)}
                              />
                              {prizeImageFile ? (
                                <button
                                  type="button"
                                  className="inline-flex h-8 items-center rounded-md bg-emerald-500/20 px-3 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-50"
                                  onClick={uploadPrizeImage}
                                  disabled={prizeImageUploading}
                                >
                                  {prizeImageUploading ? "Uploading..." : "Upload"}
                                </button>
                              ) : null}
                              {prizeImageMessage ? (
                                <p className="text-xs text-zinc-500">{prizeImageMessage}</p>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <label className="block">
                          <span className="text-sm font-medium text-zinc-300">Description</span>
                          <textarea
                            className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/20"
                            rows={2}
                            value={prizeDescription}
                            onChange={(e) => setPrizeDescription(e.target.value)}
                            placeholder="Short item details..."
                          />
                        </label>
                      </fieldset>

                      {/* Eligibility section */}
                      <fieldset className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
                        <legend className="px-2 text-sm font-semibold text-white">Eligibility filters</legend>

                        <label className="block">
                          <span className="text-sm font-medium text-zinc-300">Match mode</span>
                          <select
                            className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition focus:border-emerald-400/50"
                            value={matchMode}
                            onChange={(e) => setMatchMode(e.target.value === "any" ? "any" : "all")}
                          >
                            <option value="all">ALL filters must match</option>
                            <option value="any">ANY filter can match</option>
                          </select>
                        </label>

                        <div>
                          <span className="text-sm font-medium text-zinc-300">Scan sources</span>
                          <div className="mt-2 flex gap-4">
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200 transition has-[:checked]:border-emerald-400/30 has-[:checked]:bg-emerald-500/10 has-[:checked]:text-emerald-200">
                              <input
                                type="checkbox"
                                className="accent-emerald-400"
                                checked={sourceInPerson}
                                onChange={(e) => setSourceInPerson(e.target.checked)}
                              />
                              In person
                            </label>
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200 transition has-[:checked]:border-emerald-400/30 has-[:checked]:bg-emerald-500/10 has-[:checked]:text-emerald-200">
                              <input
                                type="checkbox"
                                className="accent-emerald-400"
                                checked={sourceRemote}
                                onChange={(e) => setSourceRemote(e.target.checked)}
                              />
                              Remote
                            </label>
                          </div>
                          {sourceRemote ? (
                            <p className="mt-1.5 text-xs text-amber-400/80">Remote mode disables business/location filters.</p>
                          ) : null}
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <label className="block">
                            <span className="text-sm font-medium text-zinc-300">Causes</span>
                            <div className="mt-1.5">
                              <Select
                                isMulti
                                options={causeOptions}
                                value={causeOptions.filter((opt) => selectedCauseIds.includes(opt.value))}
                                onChange={(items) => setSelectedCauseIds(items.map((item) => item.value))}
                                styles={multiSelectStyles}
                                placeholder="Any cause"
                                menuPortalTarget={typeof window !== "undefined" ? document.body : null}
                              />
                            </div>
                          </label>
                          <label className="block">
                            <span className="text-sm font-medium text-zinc-300">Businesses</span>
                            <div className="mt-1.5">
                              <Select
                                isMulti
                                options={businessOptions}
                                value={businessOptions.filter((opt) => selectedBusinessIds.includes(opt.value))}
                                onChange={(items) => setSelectedBusinessIds(items.map((item) => item.value))}
                                styles={multiSelectStyles}
                                placeholder={sourceRemote ? "N/A (remote)" : "Any business"}
                                menuPortalTarget={typeof window !== "undefined" ? document.body : null}
                                isDisabled={sourceRemote}
                              />
                            </div>
                          </label>
                        </div>

                        <label className="block">
                          <span className="text-sm font-medium text-zinc-300">Locations</span>
                          <div className="mt-1.5">
                            <Select
                              isMulti
                              options={locationOptions}
                              value={locationOptions.filter((opt) => selectedLocationIds.includes(opt.value))}
                              onChange={(items) => setSelectedLocationIds(items.map((item) => item.value))}
                              styles={multiSelectStyles}
                              placeholder={sourceRemote ? "N/A (remote)" : "Any location"}
                              menuPortalTarget={typeof window !== "undefined" ? document.body : null}
                              isDisabled={sourceRemote}
                            />
                          </div>
                        </label>
                      </fieldset>

                      {/* Entry logic section */}
                      <fieldset className="space-y-4 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
                        <legend className="px-2 text-sm font-semibold text-white">Entry logic</legend>
                        <label className="block">
                          <span className="text-sm font-medium text-zinc-300">Points threshold per entry</span>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/20"
                            value={entryUnitPoints}
                            onChange={(e) => setEntryUnitPoints(e.target.value)}
                            placeholder="500"
                          />
                        </label>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <label className="block">
                            <span className="text-sm font-medium text-zinc-300">In-person entry multiplier</span>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/20"
                              value={inPersonEntryMultiplier}
                              onChange={(e) => setInPersonEntryMultiplier(e.target.value)}
                              placeholder="1"
                            />
                          </label>
                          <label className="block">
                            <span className="text-sm font-medium text-zinc-300">Remote entry multiplier</span>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/20"
                              value={remoteEntryMultiplier}
                              onChange={(e) => setRemoteEntryMultiplier(e.target.value)}
                              placeholder="1"
                            />
                          </label>
                        </div>
                        <p className="text-xs text-zinc-500">
                          Entries are calculated per giveaway from carryover points, then multiplied by source.
                        </p>
                      </fieldset>
                    </div>

                    {/* Sticky footer */}
                    <div className="sticky bottom-0 flex items-center justify-between border-t border-white/[0.06] bg-[#0d1117]/95 px-6 py-4 backdrop-blur-sm">
                      <button
                        type="button"
                        className="text-sm text-zinc-400 transition hover:text-white"
                        onClick={() => { setModalOpen(false); setActionMessage(null); }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-500 px-6 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:opacity-60 disabled:shadow-none"
                        onClick={saveGiveaway}
                        disabled={saving || prizeImageUploading}
                      >
                        {saving ? "Saving…" : editing ? "Update giveaway" : "Create giveaway"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {entriesOpen && mounted && entriesGiveaway
        ? createPortal(
            <div
              className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-8 backdrop-blur-sm sm:py-12"
              onClick={(e) => { if (e.target === e.currentTarget) { setEntriesOpen(false); setEntriesError(null); } }}
            >
              <div className="flex max-h-[calc(100vh-4rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d1117] text-white shadow-2xl shadow-black/50 sm:max-h-[calc(100vh-6rem)]">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-white">{entriesGiveaway.title}</h2>
                      <p className="mt-0.5 text-xs text-zinc-500">{entriesTotal} total entries</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
                    onClick={() => { setEntriesOpen(false); setEntriesError(null); }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                </div>

                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.04] px-6 py-3">
                  <select
                    className="h-8 rounded-md border border-white/10 bg-white/5 px-2.5 text-xs text-white outline-none transition focus:border-emerald-400/50"
                    value={entriesSource}
                    onChange={(e) => setEntriesSource(e.target.value as "all" | "in_person" | "remote")}
                  >
                    <option value="all">All sources</option>
                    <option value="in_person">In person</option>
                    <option value="remote">Remote</option>
                  </select>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-xs text-zinc-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
                    onClick={() => loadEntries(entriesGiveaway.id)}
                    disabled={entriesLoading}
                  >
                    {entriesLoading ? "Loading…" : "Refresh"}
                  </button>
                  <div className="flex-1" />
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-xs text-zinc-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
                    onClick={downloadEntriesCsv}
                    disabled={entries.length === 0}
                  >
                    Export CSV
                  </button>
                </div>

                {entriesError ? (
                  <div className="mx-6 mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {entriesError}
                  </div>
                ) : null}

                {/* Table */}
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-[#0d1117] text-left text-xs uppercase tracking-wide text-zinc-500">
                      <tr className="border-b border-white/[0.04]">
                        <th className="px-6 py-2.5 font-medium">Created</th>
                        <th className="px-4 py-2.5 font-medium">User</th>
                        <th className="px-4 py-2.5 font-medium">Donation</th>
                        <th className="px-4 py-2.5 font-medium">Amount</th>
                        <th className="px-4 py-2.5 font-medium">Entries</th>
                        <th className="px-4 py-2.5 font-medium">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entriesLoading ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">
                            Loading entries…
                          </td>
                        </tr>
                      ) : entries.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">
                            No entries yet.
                          </td>
                        </tr>
                      ) : (
                        entries.map((entry) => (
                          <tr key={entry.id} className="border-t border-white/[0.03] transition hover:bg-white/[0.02]">
                            <td className="px-6 py-2.5 text-zinc-300">{formatDate(entry.createdAt)}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{entry.userId ?? "—"}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{entry.donationId ?? "—"}</td>
                            <td className="px-4 py-2.5 font-semibold text-white">{formatMoney(entry.amountCents)}</td>
                            <td className="px-4 py-2.5">
                              <span className="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                                {entry.entriesCount}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${entry.scanSource === "in_person" ? "bg-blue-500/10 text-blue-300" : entry.scanSource === "remote" ? "bg-purple-500/10 text-purple-300" : "text-zinc-500"}`}>
                                {entry.scanSource ?? "—"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {historyOpen && mounted && historyGiveaway
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-8 backdrop-blur-sm sm:py-12"
              onClick={(e) => { if (e.target === e.currentTarget) { setHistoryOpen(false); setHistoryError(null); } }}
            >
              <div className="flex max-h-[calc(100vh-4rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d1117] text-white shadow-2xl shadow-black/50 sm:max-h-[calc(100vh-6rem)]">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-6 py-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{historyGiveaway.title}</h2>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {historyItems.length} event{historyItems.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-xs text-zinc-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
                      onClick={() => loadHistory(historyGiveaway.id)}
                      disabled={historyLoading}
                    >
                      {historyLoading ? "Loading…" : "Refresh"}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
                      onClick={() => { setHistoryOpen(false); setHistoryError(null); }}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                </div>

                {historyError ? (
                  <div className="mx-6 mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {historyError}
                  </div>
                ) : null}

                {/* Timeline-style event list */}
                <div className="min-h-0 flex-1 overflow-auto p-6">
                  {historyLoading ? (
                    <div className="py-8 text-center text-sm text-zinc-500">Loading history…</div>
                  ) : historyItems.length === 0 ? (
                    <div className="py-8 text-center text-sm text-zinc-500">No history events found.</div>
                  ) : (
                    <div className="relative space-y-4 pl-6 before:absolute before:bottom-0 before:left-[7px] before:top-0 before:w-px before:bg-white/[0.06]">
                      {historyItems.map((event) => (
                        <div key={event.id} className="relative">
                          <div className="absolute -left-6 top-1.5 h-3 w-3 rounded-full border-2 border-[#0d1117] bg-zinc-600" />
                          <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <span className="inline-flex rounded-md bg-white/[0.06] px-2 py-0.5 text-xs font-semibold text-white">
                                {event.type}
                              </span>
                              <span className="text-xs text-zinc-500">{formatDate(event.at)}</span>
                            </div>
                            <div className="mt-1.5 text-xs text-zinc-400">
                              {event.actorUserId ? (
                                <span>By <span className="font-mono text-zinc-300">{event.actorUserId}</span></span>
                              ) : (
                                <span className="italic">System</span>
                              )}
                            </div>
                            {event.payload ? (
                              <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-black/30 p-2 text-[11px] leading-relaxed text-zinc-400 whitespace-pre-wrap break-words">
                                {JSON.stringify(event.payload, null, 2)}
                              </pre>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
