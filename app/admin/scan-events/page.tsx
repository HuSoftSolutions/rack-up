"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatCadence } from "@/lib/server/scan-events";
import type { ScanEventLocation } from "@/lib/types/scan-event";
import PlaceAutocompleteField from "./PlaceAutocompleteField";

type AdminScanEvent = {
  id: string;
  title: string;
  description?: string;
  active: boolean;
  place?: ScanEventLocation | null;
  proximity?: {
    mode: "auto" | "off" | "log" | "enforce";
    radiusMeters: number;
  } | null;
  association: {
    type: "standalone" | "charity" | "business_location" | "custom";
    causeId?: string | null;
    businessId?: string | null;
    locationId?: string | null;
    customLabel?: string | null;
  };
  cadence: { unit: "hours" | "days" | "weeks"; interval: number };
  rewards: {
    points: { enabled: boolean; amount: number };
    giveaway: { enabled: boolean; targetMode: "selected" | "all_active"; giveawayIds: string[]; entries: number };
  };
  imageUrl?: string | null;
  imagePath?: string | null;
  token: string;
  scanPath: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type CauseOption = { id: string; title: string };
type BusinessOption = { id: string; name: string; locations: { id: string; name: string }[] };
type GiveawayOption = { id: string; title: string; status: string };

type LoadResponse = {
  events: AdminScanEvent[];
  causes: CauseOption[];
  businesses: BusinessOption[];
  giveaways: GiveawayOption[];
  error?: string;
};

type ScanEventActivityRow = {
  id: string;
  scanEventId: string;
  userId: string | null;
  userDisplayName?: string | null;
  userEmail?: string | null;
  userPhoneNumber?: string | null;
  scanEventTitle?: string | null;
  claimCount: number;
  pointsAwarded: number;
  giveawayEntriesAwarded: number;
  giveawayAwardCount: number;
  giveawayTargetMode: string | null;
  giveawayIds: string[];
  proximity?: {
    mode: string;
    distanceMeters: number | null;
    verified: boolean | null;
    failureReason: string | null;
  } | null;
  createdAt: string | null;
};

/** Compact distance cell for the activity tables. */
function formatProximityCell(proximity: ScanEventActivityRow["proximity"]): string {
  if (!proximity || proximity.mode === "off") return "—";
  if (proximity.failureReason === "no_place") return "no place set";
  if (!proximity.verified) return "unverified";
  if (proximity.distanceMeters === null) return "verified";
  return proximity.distanceMeters >= 1000
    ? `${(proximity.distanceMeters / 1000).toFixed(1)} km`
    : `${proximity.distanceMeters} m`;
}

type FormState = {
  id: string | null;
  title: string;
  description: string;
  active: boolean;
  place: ScanEventLocation | null;
  associationType: "standalone" | "charity" | "business_location" | "custom";
  causeId: string;
  businessId: string;
  locationId: string;
  customLabel: string;
  cadenceUnit: "hours" | "days" | "weeks";
  cadenceInterval: string;
  proximityMode: "auto" | "off" | "log" | "enforce";
  proximityRadiusMeters: string;
  pointsEnabled: boolean;
  pointsAmount: string;
  giveawayEnabled: boolean;
  giveawayTargetMode: "selected" | "all_active";
  giveawayIds: string[];
  giveawayEntries: string;
  imageUrl: string;
  imagePath: string;
};

function defaultForm(): FormState {
  return {
    id: null,
    title: "",
    description: "",
    active: true,
    place: null,
    associationType: "standalone",
    causeId: "",
    businessId: "",
    locationId: "",
    customLabel: "",
    cadenceUnit: "hours",
    cadenceInterval: "24",
    proximityMode: "auto",
    proximityRadiusMeters: "100",
    pointsEnabled: true,
    pointsAmount: "50",
    giveawayEnabled: false,
    giveawayTargetMode: "selected",
    giveawayIds: [],
    giveawayEntries: "1",
    imageUrl: "",
    imagePath: "",
  };
}

export default function AdminScanEventsPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<AdminScanEvent[]>([]);
  const [causes, setCauses] = useState<CauseOption[]>([]);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [giveaways, setGiveaways] = useState<GiveawayOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copiedEventId, setCopiedEventId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [expandedActivityEventId, setExpandedActivityEventId] = useState<string | null>(null);
  const [activityByEventId, setActivityByEventId] = useState<Record<string, ScanEventActivityRow[]>>({});
  const [activityLoadingByEventId, setActivityLoadingByEventId] = useState<Record<string, boolean>>({});
  const [activityErrorByEventId, setActivityErrorByEventId] = useState<Record<string, string | null>>({});
  const [globalActivityRows, setGlobalActivityRows] = useState<ScanEventActivityRow[]>([]);
  const [globalActivityLoading, setGlobalActivityLoading] = useState(false);
  const [globalActivityError, setGlobalActivityError] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalEventFilter, setGlobalEventFilter] = useState("");
  const [expandedBackfillEventId, setExpandedBackfillEventId] = useState<string | null>(null);
  const [backfillTargetMode, setBackfillTargetMode] = useState<"selected" | "all_active">("selected");
  const [backfillGiveawayIds, setBackfillGiveawayIds] = useState<string[]>([]);
  const [backfillEntriesPerClaim, setBackfillEntriesPerClaim] = useState<string>("1");
  const [backfillUpdateEvent, setBackfillUpdateEvent] = useState(true);
  const [backfillSubmitting, setBackfillSubmitting] = useState(false);
  const [backfillResultByEventId, setBackfillResultByEventId] = useState<Record<string, string>>({});
  const [backfillErrorByEventId, setBackfillErrorByEventId] = useState<Record<string, string | null>>({});

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/scan-events", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = (await res.json()) as LoadResponse;
      if (!res.ok) throw new Error(json.error ?? "Failed to load scan events.");
      setEvents(json.events ?? []);
      setCauses(json.causes ?? []);
      setBusinesses(json.businesses ?? []);
      setGiveaways(json.giveaways ?? []);
      await loadGlobalActivity(idToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scan events.");
    } finally {
      setLoading(false);
    }
  }

  async function loadGlobalActivity(idTokenOverride?: string) {
    if (!user && !idTokenOverride) return;
    setGlobalActivityLoading(true);
    setGlobalActivityError(null);
    try {
      const idToken = idTokenOverride ?? (await user!.getIdToken());
      const res = await fetch("/api/admin/scan-events/activity?limit=500", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = (await res.json()) as { rows?: ScanEventActivityRow[]; error?: string };
      if (!res.ok || !json.rows) throw new Error(json.error ?? "Failed to load engagement activity.");
      setGlobalActivityRows(json.rows);
    } catch (err) {
      setGlobalActivityError(err instanceof Error ? err.message : "Failed to load engagement activity.");
    } finally {
      setGlobalActivityLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (events.length === 0) {
      setQrMap({});
      return;
    }
    let cancelled = false;
    async function generate() {
      const origin =
        typeof window !== "undefined"
          ? (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin).replace(/\/$/, "")
          : "";
      const next: Record<string, string> = {};
      for (const event of events) {
        const data = await QRCode.toDataURL(`${origin}${event.scanPath}`, { margin: 1, width: 200 });
        next[event.id] = data;
      }
      if (!cancelled) setQrMap(next);
    }
    void generate();
    return () => {
      cancelled = true;
    };
  }, [events]);

  const selectedBusiness = useMemo(
    () => businesses.find((item) => item.id === form.businessId) ?? null,
    [businesses, form.businessId],
  );

  const filteredGlobalActivity = useMemo(() => {
    const needle = globalSearch.trim().toLowerCase();
    return globalActivityRows.filter((row) => {
      if (globalEventFilter && row.scanEventId !== globalEventFilter) return false;
      if (!needle) return true;
      const searchText = [
        row.scanEventTitle,
        row.userDisplayName,
        row.userEmail,
        row.userPhoneNumber,
        row.userId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchText.includes(needle);
    });
  }, [globalActivityRows, globalEventFilter, globalSearch]);

  function hydrate(item: AdminScanEvent) {
    setForm({
      id: item.id,
      title: item.title,
      description: item.description ?? "",
      active: item.active !== false,
      place: item.place ?? null,
      associationType: item.association.type,
      causeId: item.association.causeId ?? "",
      businessId: item.association.businessId ?? "",
      locationId: item.association.locationId ?? "",
      customLabel: item.association.customLabel ?? "",
      cadenceUnit: item.cadence.unit,
      cadenceInterval: String(item.cadence.interval),
      proximityMode: item.proximity?.mode ?? "auto",
      proximityRadiusMeters: String(item.proximity?.radiusMeters ?? 100),
      pointsEnabled: item.rewards.points.enabled,
      pointsAmount: String(item.rewards.points.amount ?? 0),
      giveawayEnabled: item.rewards.giveaway.enabled,
      giveawayTargetMode: item.rewards.giveaway.targetMode ?? "selected",
      giveawayIds: Array.isArray(item.rewards.giveaway.giveawayIds) ? item.rewards.giveaway.giveawayIds : [],
      giveawayEntries: String(item.rewards.giveaway.entries ?? 1),
      imageUrl: item.imageUrl ?? "",
      imagePath: item.imagePath ?? "",
    });
    setMessage(null);
    setError(null);
    setIsFormModalOpen(true);
  }

  function startCreate() {
    setForm(defaultForm());
    setMessage(null);
    setError(null);
    setIsFormModalOpen(true);
  }

  async function save() {
    if (!user || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const idToken = await user.getIdToken();
      const payload = {
        title: form.title,
        description: form.description,
        active: form.active,
        place: form.place,
        association: {
          type: form.associationType,
          causeId: form.causeId || null,
          businessId: form.businessId || null,
          locationId: form.locationId || null,
          customLabel: form.customLabel || null,
        },
        cadence: {
          unit: form.cadenceUnit,
          interval: Number(form.cadenceInterval || 0),
        },
        proximity: {
          mode: form.proximityMode,
          radiusMeters: Number(form.proximityRadiusMeters || 100),
        },
        rewards: {
          points: {
            enabled: form.pointsEnabled,
            amount: Number(form.pointsAmount || 0),
          },
          giveaway: {
            enabled: form.giveawayEnabled,
            targetMode: form.giveawayTargetMode,
            giveawayIds: form.giveawayIds,
            entries: Number(form.giveawayEntries || 0),
          },
        },
        imageUrl: form.imageUrl || null,
        imagePath: form.imagePath || null,
      };
      const endpoint = form.id ? `/api/admin/scan-events/${form.id}` : "/api/admin/scan-events";
      const method = form.id ? "PATCH" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save scan event.");
      setMessage(form.id ? "Scan event updated." : "Scan event created.");
      if (!form.id) setForm(defaultForm());
      setIsFormModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save scan event.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file: File) {
    if (!user) return;
    setUploading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const formData = new FormData();
      formData.set("image", file);
      const res = await fetch("/api/admin/scan-events/upload-image", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });
      const json = (await res.json()) as { error?: string; url?: string; path?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Failed to upload image.");
      setForm((prev) => ({
        ...prev,
        imageUrl: json.url ?? "",
        imagePath: json.path ?? "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image.");
    } finally {
      setUploading(false);
    }
  }

  function openBackfill(event: AdminScanEvent) {
    const next = expandedBackfillEventId === event.id ? null : event.id;
    setExpandedBackfillEventId(next);
    if (next) {
      setBackfillTargetMode(event.rewards.giveaway.targetMode ?? "selected");
      setBackfillGiveawayIds(
        Array.isArray(event.rewards.giveaway.giveawayIds) ? event.rewards.giveaway.giveawayIds : [],
      );
      setBackfillEntriesPerClaim(String(event.rewards.giveaway.entries || 1));
      setBackfillUpdateEvent(true);
      setBackfillErrorByEventId((prev) => ({ ...prev, [event.id]: null }));
    }
  }

  async function runBackfill(eventId: string) {
    if (!user || backfillSubmitting) return;
    setBackfillSubmitting(true);
    setBackfillErrorByEventId((prev) => ({ ...prev, [eventId]: null }));
    setBackfillResultByEventId((prev) => {
      const next = { ...prev };
      delete next[eventId];
      return next;
    });
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin/scan-events/${eventId}/backfill-entries`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetMode: backfillTargetMode,
          giveawayIds: backfillGiveawayIds,
          entriesPerClaim: Number(backfillEntriesPerClaim || 1),
          updateScanEvent: backfillUpdateEvent,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        claimsScanned?: number;
        claimsUpdated?: number;
        giveawayCount?: number;
        entriesCreated?: number;
        entriesSkippedAsExisting?: number;
        updatedEvent?: boolean;
      };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Backfill failed.");
      setBackfillResultByEventId((prev) => ({
        ...prev,
        [eventId]: `${json.claimsScanned ?? 0} claims (${json.claimsUpdated ?? 0} activity rows updated) → ${json.entriesCreated ?? 0} entries created across ${json.giveawayCount ?? 0} giveaway(s) (${json.entriesSkippedAsExisting ?? 0} already existed)${json.updatedEvent ? ". Scan event updated." : "."}`,
      }));
      await load();
      setActivityByEventId((prev) => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
      if (expandedActivityEventId === eventId) {
        await loadActivity(eventId);
      }
    } catch (err) {
      setBackfillErrorByEventId((prev) => ({
        ...prev,
        [eventId]: err instanceof Error ? err.message : "Backfill failed.",
      }));
    } finally {
      setBackfillSubmitting(false);
    }
  }

  async function loadActivity(eventId: string) {
    if (!user) return;
    setActivityLoadingByEventId((prev) => ({ ...prev, [eventId]: true }));
    setActivityErrorByEventId((prev) => ({ ...prev, [eventId]: null }));
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin/scan-events/${eventId}/activity?limit=200`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = (await res.json()) as { rows?: ScanEventActivityRow[]; error?: string };
      if (!res.ok || !json.rows) throw new Error(json.error ?? "Failed to load activity.");
      setActivityByEventId((prev) => ({ ...prev, [eventId]: json.rows ?? [] }));
    } catch (err) {
      setActivityErrorByEventId((prev) => ({
        ...prev,
        [eventId]: err instanceof Error ? err.message : "Failed to load activity.",
      }));
    } finally {
      setActivityLoadingByEventId((prev) => ({ ...prev, [eventId]: false }));
    }
  }

  return (
    <div className="space-y-6 text-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Admin</p>
        <h1 className="text-2xl font-bold tracking-tight text-white">Scan Events</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Build real-world QR campaigns with claim cadence and optional points or giveaway entries.
        </p>
      </div>

      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div> : null}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Add or edit scan events</h2>
            <p className="mt-1 text-sm text-zinc-400">Open the editor in a modal for a focused workflow.</p>
          </div>
          <button
            type="button"
            onClick={startCreate}
            className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-300 active:scale-[0.98]"
          >
            Add scan event
          </button>
        </div>
      </section>

      {isFormModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 md:items-center md:p-6" role="dialog" aria-modal="true">
          <section className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-[#101116] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{form.id ? "Edit scan event" : "Create scan event"}</h2>
              <div className="flex items-center gap-2">
                {form.id ? (
                  <button
                    type="button"
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-white/5 active:scale-[0.98]"
                    onClick={startCreate}
                  >
                    New event
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-white/5 active:scale-[0.98]"
                  onClick={() => setIsFormModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-zinc-300">
            <div className="mb-1">Title</div>
            <input
              className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />
          </label>
          <label className="text-sm text-zinc-300">
            <div className="mb-1">Status</div>
            <select
              className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400"
              value={form.active ? "active" : "inactive"}
              onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.value === "active" }))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
            </div>

            <label className="mt-3 block text-sm text-zinc-300">
              <div className="mb-1">Description</div>
              <textarea
                className="min-h-20 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-emerald-400"
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>

            <div className="mt-3 text-sm text-zinc-300">
              <div className="mb-1">Scan location (shown on the public map &amp; &ldquo;Where to scan&rdquo; page)</div>
              <PlaceAutocompleteField
                value={form.place}
                onChange={(place) => setForm((prev) => ({ ...prev, place }))}
              />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-sm text-zinc-300">
                <div className="mb-1">Location checking</div>
                <select
                  className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400"
                  value={form.proximityMode}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      proximityMode: event.target.value as FormState["proximityMode"],
                    }))
                  }
                >
                  <option value="auto">
                    Automatic &mdash; on whenever a scan location is set (recommended)
                  </option>
                  <option value="off">Off &mdash; claim from anywhere</option>
                  <option value="log">Log only &mdash; record the result, never block</option>
                  <option value="enforce">Enforce &mdash; always block outside the radius</option>
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  {form.proximityMode === "auto"
                    ? form.place
                      ? "Active: claims must be made at the scan location above."
                      : "Inactive until a scan location is set above. Add one to protect this event."
                    : "Overrides the automatic default for this event only."}
                </p>
              </label>
              <label className="text-sm text-zinc-300">
                <div className="mb-1">Allowed radius (meters)</div>
                <input
                  type="number"
                  min={25}
                  max={5000}
                  disabled={form.proximityMode === "off"}
                  className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400 disabled:opacity-50"
                  value={form.proximityRadiusMeters}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, proximityRadiusMeters: event.target.value }))
                  }
                />
                <p className="mt-1 text-xs text-zinc-500">100m is a good default.</p>
              </label>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-sm text-zinc-300">
            <div className="mb-1">Association type</div>
            <select
              className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400"
              value={form.associationType}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  associationType: event.target.value as FormState["associationType"],
                  causeId: "",
                  businessId: "",
                  locationId: "",
                  customLabel: "",
                }))
              }
            >
              <option value="standalone">Standalone Rack Up Event</option>
              <option value="charity">Associated to Charity</option>
              <option value="business_location">Associated to Business/Location</option>
              <option value="custom">Custom One-Off Event</option>
            </select>
          </label>
          {form.associationType === "charity" ? (
            <label className="text-sm text-zinc-300">
              <div className="mb-1">Charity</div>
              <select
                className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400"
                value={form.causeId}
                onChange={(event) => setForm((prev) => ({ ...prev, causeId: event.target.value }))}
              >
                <option value="">Select charity</option>
                {causes.map((cause) => (
                  <option key={cause.id} value={cause.id}>
                    {cause.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {form.associationType === "business_location" ? (
            <>
              <label className="text-sm text-zinc-300">
                <div className="mb-1">Business</div>
                <select
                  className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400"
                  value={form.businessId}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, businessId: event.target.value, locationId: "" }))
                  }
                >
                  <option value="">Select business</option>
                  {businesses.map((biz) => (
                    <option key={biz.id} value={biz.id}>
                      {biz.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-zinc-300">
                <div className="mb-1">Location (optional)</div>
                <select
                  className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400"
                  value={form.locationId}
                  onChange={(event) => setForm((prev) => ({ ...prev, locationId: event.target.value }))}
                >
                  <option value="">Any location</option>
                  {(selectedBusiness?.locations ?? []).map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          {form.associationType === "custom" ? (
            <label className="text-sm text-zinc-300">
              <div className="mb-1">Custom label</div>
              <input
                className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400"
                value={form.customLabel}
                onChange={(event) => setForm((prev) => ({ ...prev, customLabel: event.target.value }))}
              />
            </label>
          ) : null}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm text-zinc-300">
            <div className="mb-1">Cadence unit</div>
            <select
              className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400"
              value={form.cadenceUnit}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, cadenceUnit: event.target.value as FormState["cadenceUnit"] }))
              }
            >
              <option value="hours">Hours</option>
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
            </select>
          </label>
          <label className="text-sm text-zinc-300">
            <div className="mb-1">Cadence interval</div>
            <input
              type="number"
              min={1}
              className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400"
              value={form.cadenceInterval}
              onChange={(event) => setForm((prev) => ({ ...prev, cadenceInterval: event.target.value }))}
            />
          </label>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <label className="flex items-center gap-2 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={form.pointsEnabled}
                onChange={(event) => setForm((prev) => ({ ...prev, pointsEnabled: event.target.checked }))}
              />
              Award points
            </label>
            <label className="mt-2 block text-sm text-zinc-300">
              <div className="mb-1">Points per claim</div>
              <input
                type="number"
                min={0}
                className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400"
                value={form.pointsAmount}
                onChange={(event) => setForm((prev) => ({ ...prev, pointsAmount: event.target.value }))}
                disabled={!form.pointsEnabled}
              />
            </label>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <label className="flex items-center gap-2 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={form.giveawayEnabled}
                onChange={(event) => setForm((prev) => ({ ...prev, giveawayEnabled: event.target.checked }))}
              />
              Award giveaway entries
            </label>
            <label className="mt-2 block text-sm text-zinc-300">
              <div className="mb-1">Target mode</div>
              <select
                className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400"
                value={form.giveawayTargetMode}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    giveawayTargetMode: event.target.value as "selected" | "all_active",
                  }))
                }
                disabled={!form.giveawayEnabled}
              >
                <option value="selected">Selected giveaways</option>
                <option value="all_active">All active giveaways</option>
              </select>
            </label>
            {form.giveawayEnabled && form.giveawayTargetMode === "selected" ? (
              <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-white/5 p-2">
                {giveaways.length === 0 ? (
                  <div className="text-xs text-zinc-500">No giveaways available.</div>
                ) : (
                  giveaways.map((item) => {
                    const checked = form.giveawayIds.includes(item.id);
                    return (
                      <label key={item.id} className="flex items-center gap-2 text-xs text-zinc-200">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...form.giveawayIds, item.id]
                              : form.giveawayIds.filter((id) => id !== item.id);
                            setForm((prev) => ({ ...prev, giveawayIds: next }));
                          }}
                        />
                        <span>
                          {item.title} ({item.status})
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            ) : null}
            <label className="mt-2 block text-sm text-zinc-300">
              <div className="mb-1">Entries per claim</div>
              <input
                type="number"
                min={1}
                className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400"
                value={form.giveawayEntries}
                onChange={(event) => setForm((prev) => ({ ...prev, giveawayEntries: event.target.value }))}
                disabled={!form.giveawayEnabled}
              />
            </label>
          </div>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-sm text-zinc-200">Optional custom image for one-off events</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-white/5 active:scale-[0.98]">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadImage(file);
                    }}
                  />
                  {uploading ? "Uploading..." : "Upload image"}
                </label>
                {form.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.imageUrl} alt="Scan event" className="h-14 w-24 rounded-lg object-cover" />
                ) : (
                  <span className="text-xs text-zinc-500">No image selected</span>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/5 active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-300 active:scale-[0.98] disabled:opacity-60"
              >
                {saving ? "Saving..." : form.id ? "Update scan event" : "Create scan event"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Engagement activity</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Live view of claims across all scan events with user identity details.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadGlobalActivity()}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-white/5 active:scale-[0.98]"
          >
            Refresh feed
          </button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-xs text-zinc-400">
            Event filter
            <select
              className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
              value={globalEventFilter}
              onChange={(event) => setGlobalEventFilter(event.target.value)}
            >
              <option value="">All scan events</option>
              {events.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-400 md:col-span-2">
            Search (name, email, phone, user ID)
            <input
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
              placeholder="Start typing..."
              className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
            />
          </label>
        </div>

        {globalActivityError ? (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
            {globalActivityError}
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Claims shown</div>
            <div className="mt-1 text-lg font-semibold text-white">{filteredGlobalActivity.length}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Points awarded</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {filteredGlobalActivity.reduce((sum, row) => sum + row.pointsAwarded, 0)}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Giveaway entries</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {filteredGlobalActivity.reduce((sum, row) => sum + row.giveawayEntriesAwarded, 0)}
            </div>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
          {globalActivityLoading ? (
            <div className="p-4 text-sm text-zinc-400">Loading engagement activity...</div>
          ) : filteredGlobalActivity.length === 0 ? (
            <div className="p-4 text-sm text-zinc-500">No engagement activity found for this filter.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-white/[0.03] text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Event</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">Claim #</th>
                  <th className="px-3 py-2">Points</th>
                  <th className="px-3 py-2">Entries</th>
                  <th className="px-3 py-2">Distance</th>
                </tr>
              </thead>
              <tbody>
                {filteredGlobalActivity.map((row) => (
                  <tr key={row.id} className="border-t border-white/10 text-zinc-200">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2">{row.scanEventTitle ?? row.scanEventId ?? "—"}</td>
                    <td className="px-3 py-2">{row.userDisplayName ?? "—"}</td>
                    <td className="px-3 py-2">{row.userEmail ?? "—"}</td>
                    <td className="px-3 py-2">{row.userPhoneNumber ?? "—"}</td>
                    <td className="px-3 py-2">{row.claimCount}</td>
                    <td className="px-3 py-2">{row.pointsAwarded}</td>
                    <td className="px-3 py-2">{row.giveawayEntriesAwarded}</td>
                    <td
                      className={`px-3 py-2 whitespace-nowrap ${
                        row.proximity && row.proximity.mode !== "off" && !row.proximity.verified
                        ? "text-amber-300"
                        : ""
                      }`}
                    >
                      {formatProximityCell(row.proximity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Existing scan events</h2>
        {loading ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">Loading...</div>
        ) : events.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400">No scan events yet.</div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {events.map((event) => (
              <article key={event.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-white">{event.title}</h3>
                    <p className="text-xs text-zinc-500">{event.active ? "Active" : "Inactive"} • {formatCadence(event.cadence)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => hydrate(event)}
                      className={`rounded-lg border px-3 py-1 text-xs transition active:scale-[0.98] ${
                        isFormModalOpen && form.id === event.id
                          ? "border-emerald-300/70 bg-emerald-400/15 text-emerald-100"
                          : "border-white/15 text-zinc-200 hover:bg-white/5 active:bg-white/10"
                      }`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = expandedActivityEventId === event.id ? null : event.id;
                        setExpandedActivityEventId(next);
                        if (next && !activityByEventId[event.id]) void loadActivity(event.id);
                      }}
                      className={`rounded-lg border px-3 py-1 text-xs transition active:scale-[0.98] ${
                        expandedActivityEventId === event.id
                          ? "border-sky-300/70 bg-sky-400/15 text-sky-100"
                          : "border-white/15 text-zinc-200 hover:bg-white/5 active:bg-white/10"
                      }`}
                    >
                      {expandedActivityEventId === event.id ? "Hide activity" : "View activity"}
                    </button>
                    <button
                      type="button"
                      onClick={() => openBackfill(event)}
                      className={`rounded-lg border px-3 py-1 text-xs transition active:scale-[0.98] ${
                        expandedBackfillEventId === event.id
                          ? "border-amber-300/70 bg-amber-400/15 text-amber-100"
                          : "border-white/15 text-zinc-200 hover:bg-white/5 active:bg-white/10"
                      }`}
                    >
                      {expandedBackfillEventId === event.id ? "Cancel backfill" : "Backfill to giveaway"}
                    </button>
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-zinc-300">{event.description || "No description."}</p>
                <p className="mt-2 text-xs text-zinc-400">
                  Rewards: {event.rewards.points.enabled ? `${event.rewards.points.amount} pts` : "0 pts"}
                  {event.rewards.giveaway.enabled
                    ? ` + ${event.rewards.giveaway.entries} entries (${event.rewards.giveaway.targetMode === "all_active" ? "all active giveaways" : `${event.rewards.giveaway.giveawayIds.length} selected`})`
                    : ""}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  {qrMap[event.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrMap[event.id]} alt={`${event.title} QR`} className="h-20 w-20 rounded-lg border border-white/10 bg-white" />
                  ) : (
                    <div className="h-20 w-20 rounded-lg border border-white/10 bg-white/5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-zinc-400">{event.scanPath}</p>
                    <button
                      type="button"
                      className={`mt-1 rounded border px-2 py-1 text-xs transition active:scale-[0.98] ${
                        copiedEventId === event.id
                          ? "border-emerald-300/70 bg-emerald-400/15 text-emerald-100"
                          : "border-white/15 text-zinc-200 hover:bg-white/5 active:bg-white/10"
                      }`}
                      onClick={async () => {
                        try {
                          const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin).replace(/\/$/, "");
                          await navigator.clipboard.writeText(`${origin}${event.scanPath}`);
                          setCopiedEventId(event.id);
                          setMessage("Scan URL copied.");
                          window.setTimeout(() => {
                            setCopiedEventId((current) => (current === event.id ? null : current));
                          }, 1400);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Failed to copy scan URL.");
                        }
                      }}
                    >
                      {copiedEventId === event.id ? "Copied!" : "Copy scan URL"}
                    </button>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a
                        href={event.scanPath}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded border border-white/15 px-2 py-1 text-xs text-zinc-200 transition hover:bg-white/5 active:bg-white/10"
                      >
                        Open live page
                      </a>
                      <Link
                        href={`/admin/scan-events/print/${event.id}`}
                        className="rounded border border-white/15 px-2 py-1 text-xs text-zinc-200 transition hover:bg-white/5 active:bg-white/10"
                      >
                        Print poster
                      </Link>
                    </div>
                  </div>
                </div>
                {expandedBackfillEventId === event.id ? (
                  <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/[0.05] p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-200">
                      Backfill scan claims to giveaway entries
                    </p>
                    <p className="mb-3 text-xs text-zinc-400">
                      Creates one giveaway entry per existing scan claim for this event. Safe to re-run; existing entries are skipped.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs text-zinc-300">
                        <div className="mb-1 font-medium text-zinc-100">Target giveaways</div>
                        <select
                          className="h-9 w-full rounded border border-white/10 bg-black/40 px-2 text-xs text-white outline-none focus:border-amber-300"
                          value={backfillTargetMode}
                          onChange={(e) =>
                            setBackfillTargetMode(e.target.value === "all_active" ? "all_active" : "selected")
                          }
                        >
                          <option value="selected">Selected giveaway(s)</option>
                          <option value="all_active">All active giveaways</option>
                        </select>
                      </label>
                      <label className="text-xs text-zinc-300">
                        <div className="mb-1 font-medium text-zinc-100">Entries per claim</div>
                        <input
                          type="number"
                          min={1}
                          className="h-9 w-full rounded border border-white/10 bg-black/40 px-2 text-xs text-white outline-none focus:border-amber-300"
                          value={backfillEntriesPerClaim}
                          onChange={(e) => setBackfillEntriesPerClaim(e.target.value)}
                        />
                      </label>
                    </div>
                    {backfillTargetMode === "selected" ? (
                      <div className="mt-3">
                        <div className="mb-1 text-xs font-medium text-zinc-100">Pick giveaways</div>
                        <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-white/5 bg-black/30 p-2">
                          {giveaways.length === 0 ? (
                            <div className="text-xs text-zinc-500">No active or draft giveaways available.</div>
                          ) : (
                            giveaways.map((g) => {
                              const checked = backfillGiveawayIds.includes(g.id);
                              return (
                                <label key={g.id} className="flex cursor-pointer items-center gap-2 text-xs text-zinc-200">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      setBackfillGiveawayIds((prev) =>
                                        checked ? prev.filter((id) => id !== g.id) : [...prev, g.id],
                                      )
                                    }
                                  />
                                  <span>{g.title}</span>
                                  <span className="text-zinc-500">({g.status})</span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      </div>
                    ) : null}
                    <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-zinc-200">
                      <input
                        type="checkbox"
                        checked={backfillUpdateEvent}
                        onChange={(e) => setBackfillUpdateEvent(e.target.checked)}
                      />
                      Also update this scan event so future scans flow into the same giveaway(s)
                    </label>
                    {backfillErrorByEventId[event.id] ? (
                      <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
                        {backfillErrorByEventId[event.id]}
                      </div>
                    ) : null}
                    {backfillResultByEventId[event.id] ? (
                      <div className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-200">
                        {backfillResultByEventId[event.id]}
                      </div>
                    ) : null}
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void runBackfill(event.id)}
                        disabled={backfillSubmitting}
                        className="rounded bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-amber-300 disabled:opacity-60"
                      >
                        {backfillSubmitting ? "Backfilling…" : "Run backfill"}
                      </button>
                    </div>
                  </div>
                ) : null}
                {expandedActivityEventId === event.id ? (
                  <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Recent claim activity
                    </p>
                    {activityErrorByEventId[event.id] ? (
                      <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
                        {activityErrorByEventId[event.id]}
                      </div>
                    ) : activityLoadingByEventId[event.id] ? (
                      <div className="text-xs text-zinc-400">Loading activity...</div>
                    ) : (activityByEventId[event.id]?.length ?? 0) === 0 ? (
                      <div className="text-xs text-zinc-500">No claims yet.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead className="text-left text-zinc-500">
                            <tr>
                              <th className="px-2 py-1">When</th>
                              <th className="px-2 py-1">Name</th>
                              <th className="px-2 py-1">Email</th>
                              <th className="px-2 py-1">Phone</th>
                              <th className="px-2 py-1">Claim #</th>
                              <th className="px-2 py-1">Points</th>
                              <th className="px-2 py-1">Entries</th>
                              <th className="px-2 py-1">Giveaways</th>
                              <th className="px-2 py-1">Distance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(activityByEventId[event.id] ?? []).map((row) => (
                              <tr key={row.id} className="border-t border-white/10 text-zinc-200">
                                <td className="px-2 py-1">{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</td>
                                <td className="px-2 py-1">{row.userDisplayName ?? "—"}</td>
                                <td className="px-2 py-1">{row.userEmail ?? "—"}</td>
                                <td className="px-2 py-1">{row.userPhoneNumber ?? "—"}</td>
                                <td className="px-2 py-1">{row.claimCount}</td>
                                <td className="px-2 py-1">{row.pointsAwarded}</td>
                                <td className="px-2 py-1">{row.giveawayEntriesAwarded}</td>
                                <td className="px-2 py-1">{row.giveawayAwardCount}</td>
                                <td
                                  className={`px-2 py-1 ${
                                    row.proximity && row.proximity.mode !== "off" && !row.proximity.verified
                        ? "text-amber-300"
                        : ""
                                  }`}
                                >
                                  {formatProximityCell(row.proximity)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
