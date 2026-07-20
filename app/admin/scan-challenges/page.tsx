"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

type ChallengeThreshold = { id: string; scanCount: number; entries: number };

type ChallengeWindow = {
  type: "calendar_week" | "rolling_days" | "challenge_period";
  timezone: string;
  weekStartsOn?: number;
  days?: number;
};

type ChallengeScope = {
  matchMode: "all" | "any";
  businessIds: string[];
  causeIds: string[];
  locationIds: string[];
  scanEventIds: string[];
};

type AdminScanChallenge = {
  id: string;
  title: string;
  active: boolean;
  window: ChallengeWindow;
  scope: ChallengeScope;
  countMode: "distinct_events" | "claims";
  thresholds: ChallengeThreshold[];
  giveaway: { targetMode: "selected" | "all_active"; giveawayIds: string[] };
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type GiveawayOption = { id: string; title: string; status: string };
type CauseOption = { id: string; title: string };
type BusinessOption = { id: string; name: string; locations: { id: string; name: string }[] };
type ScanEventOption = { id: string; title: string };

type ChallengesResponse = { challenges?: AdminScanChallenge[]; giveaways?: GiveawayOption[]; error?: string };
type ScanEventsResponse = {
  events?: ScanEventOption[];
  causes?: CauseOption[];
  businesses?: BusinessOption[];
  error?: string;
};

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

const WEEKDAYS: { value: string; label: string }[] = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "7", label: "Sunday" },
];

type ThresholdRow = { scanCount: string; entries: string };

type FormState = {
  id: string | null;
  title: string;
  active: boolean;
  windowType: "calendar_week" | "rolling_days" | "challenge_period";
  timezone: string;
  weekStartsOn: string;
  rollingDays: string;
  countMode: "distinct_events" | "claims";
  scopeMatchMode: "all" | "any";
  scopeBusinessIds: string[];
  scopeCauseIds: string[];
  scopeLocationIds: string[];
  scopeScanEventIds: string[];
  thresholds: ThresholdRow[];
  giveawayTargetMode: "selected" | "all_active";
  giveawayIds: string[];
  startsAt: string;
  endsAt: string;
};

function defaultForm(): FormState {
  return {
    id: null,
    title: "",
    active: true,
    windowType: "calendar_week",
    timezone: "America/New_York",
    weekStartsOn: "1",
    rollingDays: "7",
    countMode: "claims",
    scopeMatchMode: "all",
    scopeBusinessIds: [],
    scopeCauseIds: [],
    scopeLocationIds: [],
    scopeScanEventIds: [],
    thresholds: [
      { scanCount: "3", entries: "1" },
      { scanCount: "5", entries: "1" },
    ],
    giveawayTargetMode: "selected",
    giveawayIds: [],
    startsAt: "",
    endsAt: "",
  };
}

function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const inputClass =
  "h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400";

function summarize(challenge: AdminScanChallenge): string {
  const tiers = [...challenge.thresholds]
    .sort((a, b) => a.scanCount - b.scanCount)
    .map((t) => `${t.scanCount} scan${t.scanCount === 1 ? "" : "s"} → ${t.entries} ${t.entries === 1 ? "entry" : "entries"}`)
    .join(", ");
  const window =
    challenge.window.type === "calendar_week"
      ? `each ${WEEKDAYS.find((d) => d.value === String(challenge.window.weekStartsOn ?? 1))?.label ?? "Monday"}-start week`
      : challenge.window.type === "challenge_period"
        ? "across the whole challenge period"
        : `any ${challenge.window.days ?? 7}-day window`;
  const counting = challenge.countMode === "distinct_events" ? "distinct events" : "total scans";
  return `${tiers || "No tiers"} · counted as ${counting} · ${window}`;
}

export default function AdminScanChallengesPage() {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<AdminScanChallenge[]>([]);
  const [giveaways, setGiveaways] = useState<GiveawayOption[]>([]);
  const [causes, setCauses] = useState<CauseOption[]>([]);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [scanEvents, setScanEvents] = useState<ScanEventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [showScope, setShowScope] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [backfillOpenId, setBackfillOpenId] = useState<string | null>(null);
  const [bf, setBf] = useState({
    startDate: "",
    endDate: "",
    countMode: "claims" as "distinct_events" | "claims",
    targetMode: "selected" as "selected" | "all_active",
    giveawayIds: [] as string[],
    thresholds: [{ scanCount: "3", entries: "1" }] as ThresholdRow[],
  });
  const [bfBusy, setBfBusy] = useState(false);
  const [bfResult, setBfResult] = useState<string | null>(null);
  const [bfError, setBfError] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const [challengeRes, scanEventRes] = await Promise.all([
        fetch("/api/admin/scan-challenges", { headers: { Authorization: `Bearer ${idToken}` } }),
        fetch("/api/admin/scan-events", { headers: { Authorization: `Bearer ${idToken}` } }),
      ]);
      const challengeJson = (await challengeRes.json()) as ChallengesResponse;
      if (!challengeRes.ok) throw new Error(challengeJson.error ?? "Failed to load scan challenges.");
      const scanEventJson = (await scanEventRes.json()) as ScanEventsResponse;
      if (!scanEventRes.ok) throw new Error(scanEventJson.error ?? "Failed to load scan events.");

      setChallenges(challengeJson.challenges ?? []);
      setGiveaways(challengeJson.giveaways ?? []);
      setCauses(scanEventJson.causes ?? []);
      setBusinesses(scanEventJson.businesses ?? []);
      setScanEvents((scanEventJson.events ?? []).map((e) => ({ id: e.id, title: e.title })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scan challenges.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const locationOptions = useMemo(
    () =>
      businesses.flatMap((biz) =>
        (biz.locations ?? []).map((loc) => ({ id: loc.id, label: `${biz.name} — ${loc.name}` })),
      ),
    [businesses],
  );

  function startCreate() {
    setForm(defaultForm());
    setShowScope(false);
    setMessage(null);
    setError(null);
    setIsFormModalOpen(true);
  }

  function hydrate(item: AdminScanChallenge) {
    const scopeHasValues =
      (item.scope.businessIds?.length ?? 0) +
        (item.scope.causeIds?.length ?? 0) +
        (item.scope.locationIds?.length ?? 0) +
        (item.scope.scanEventIds?.length ?? 0) >
      0;
    setForm({
      id: item.id,
      title: item.title,
      active: item.active !== false,
      windowType:
        item.window.type === "rolling_days"
          ? "rolling_days"
          : item.window.type === "challenge_period"
            ? "challenge_period"
            : "calendar_week",
      timezone: item.window.timezone ?? "America/New_York",
      weekStartsOn: String(item.window.weekStartsOn ?? 1),
      rollingDays: String(item.window.days ?? 7),
      countMode: item.countMode === "claims" ? "claims" : "distinct_events",
      scopeMatchMode: item.scope.matchMode === "any" ? "any" : "all",
      scopeBusinessIds: item.scope.businessIds ?? [],
      scopeCauseIds: item.scope.causeIds ?? [],
      scopeLocationIds: item.scope.locationIds ?? [],
      scopeScanEventIds: item.scope.scanEventIds ?? [],
      thresholds:
        item.thresholds.length > 0
          ? [...item.thresholds]
              .sort((a, b) => a.scanCount - b.scanCount)
              .map((t) => ({ scanCount: String(t.scanCount), entries: String(t.entries) }))
          : [{ scanCount: "3", entries: "1" }],
      giveawayTargetMode: item.giveaway.targetMode === "all_active" ? "all_active" : "selected",
      giveawayIds: item.giveaway.giveawayIds ?? [],
      startsAt: isoToLocalInput(item.startsAt),
      endsAt: isoToLocalInput(item.endsAt),
    });
    setShowScope(scopeHasValues);
    setMessage(null);
    setError(null);
    setIsFormModalOpen(true);
  }

  function toggleId(list: string[], id: string, checked: boolean): string[] {
    return checked ? [...list, id] : list.filter((x) => x !== id);
  }

  async function save() {
    if (!user || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const thresholds = form.thresholds
        .map((t) => ({ scanCount: Number(t.scanCount || 0), entries: Number(t.entries || 0) }))
        .filter((t) => t.scanCount > 0 && t.entries > 0);
      if (thresholds.length === 0) {
        throw new Error("Add at least one tier (e.g. 3 scans → 1 entry).");
      }
      if (form.windowType === "challenge_period" && !form.startsAt) {
        throw new Error("Set a start date — entire-period challenges need one.");
      }

      const idToken = await user.getIdToken();
      const payload = {
        id: form.id ?? undefined,
        title: form.title,
        active: form.active,
        window:
          form.windowType === "calendar_week"
            ? {
                type: "calendar_week" as const,
                timezone: form.timezone,
                weekStartsOn: Number(form.weekStartsOn || 1),
              }
            : form.windowType === "challenge_period"
              ? {
                  type: "challenge_period" as const,
                  timezone: form.timezone,
                }
              : {
                  type: "rolling_days" as const,
                  timezone: form.timezone,
                  days: Number(form.rollingDays || 7),
                },
        scope: {
          matchMode: form.scopeMatchMode,
          businessIds: form.scopeBusinessIds,
          causeIds: form.scopeCauseIds,
          locationIds: form.scopeLocationIds,
          scanEventIds: form.scopeScanEventIds,
        },
        countMode: form.countMode,
        thresholds,
        giveaway: {
          targetMode: form.giveawayTargetMode,
          giveawayIds: form.giveawayIds,
        },
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      };

      const res = await fetch("/api/admin/scan-challenges", {
        method: form.id ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save scan challenge.");
      setMessage(form.id ? "Scan challenge updated." : "Scan challenge created.");
      setIsFormModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save scan challenge.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(challenge: AdminScanChallenge) {
    if (!user || busyId) return;
    setBusyId(challenge.id);
    setError(null);
    setMessage(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/scan-challenges", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: challenge.id, active: !challenge.active }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to update challenge.");
      setMessage(challenge.active ? "Challenge paused." : "Challenge activated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update challenge.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(challenge: AdminScanChallenge) {
    if (!user || busyId) return;
    if (!window.confirm(`Delete "${challenge.title}"? This cannot be undone. Entries already awarded are kept.`)) {
      return;
    }
    setBusyId(challenge.id);
    setError(null);
    setMessage(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin/scan-challenges?id=${encodeURIComponent(challenge.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to delete challenge.");
      setMessage("Challenge deleted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete challenge.");
    } finally {
      setBusyId(null);
    }
  }

  function openBackfill(challenge: AdminScanChallenge) {
    const next = backfillOpenId === challenge.id ? null : challenge.id;
    setBackfillOpenId(next);
    setBfResult(null);
    setBfError(null);
    if (next) {
      setBf({
        startDate: isoToLocalInput(challenge.startsAt),
        endDate: isoToLocalInput(challenge.endsAt),
        countMode: challenge.countMode === "distinct_events" ? "distinct_events" : "claims",
        targetMode: challenge.giveaway.targetMode === "all_active" ? "all_active" : "selected",
        giveawayIds: challenge.giveaway.giveawayIds ?? [],
        thresholds:
          challenge.thresholds.length > 0
            ? [...challenge.thresholds]
                .sort((a, b) => a.scanCount - b.scanCount)
                .map((t) => ({ scanCount: String(t.scanCount), entries: String(t.entries) }))
            : [{ scanCount: "3", entries: "1" }],
      });
    }
  }

  async function runBackfill(challengeId: string, mode: "preview" | "commit") {
    if (!user || bfBusy) return;
    if (
      mode === "commit" &&
      !window.confirm(
        "Create giveaway entries for everyone who qualifies in this date range? This writes to the live giveaway. Safe to re-run — entries that already exist are skipped.",
      )
    ) {
      return;
    }
    setBfBusy(true);
    setBfError(null);
    if (mode === "commit") setBfResult(null);
    try {
      const idToken = await user.getIdToken();
      const thresholds = bf.thresholds
        .map((t) => ({ scanCount: Number(t.scanCount || 0), entries: Number(t.entries || 0) }))
        .filter((t) => t.scanCount > 0 && t.entries > 0);
      const res = await fetch(`/api/admin/scan-challenges/${challengeId}/backfill`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          // Raw datetime-local strings: the server interprets them in the
          // challenge's timezone so the admin's browser timezone can't shift them.
          startDate: bf.startDate || null,
          endDate: bf.endDate || null,
          countMode: bf.countMode,
          thresholds,
          targetMode: bf.targetMode,
          giveawayIds: bf.giveawayIds,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        claimsScanned?: number;
        usersQualified?: number;
        entriesToCreate?: number;
        entriesCreated?: number;
        entriesAlreadyExist?: number;
        giveawayCount?: number;
        warnings?: string[];
      };
      if (!res.ok) throw new Error(json.error ?? "Backfill failed.");
      const gCount = json.giveawayCount ?? 0;
      const action =
        mode === "preview"
          ? `${json.entriesToCreate ?? 0} entries would be created`
          : `${json.entriesCreated ?? 0} entries created`;
      const warningText =
        Array.isArray(json.warnings) && json.warnings.length > 0 ? ` ⚠ ${json.warnings.join(" ")}` : "";
      setBfResult(
        `${mode === "preview" ? "Preview" : "Done"}: scanned ${json.claimsScanned ?? 0} scans · ${json.usersQualified ?? 0} members qualify · ${action} · ${json.entriesAlreadyExist ?? 0} already existed · ${gCount} giveaway${gCount === 1 ? "" : "s"}.${warningText}`,
      );
    } catch (err) {
      setBfError(err instanceof Error ? err.message : "Backfill failed.");
    } finally {
      setBfBusy(false);
    }
  }

  return (
    <div className="space-y-6 text-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Admin</p>
        <h1 className="text-2xl font-bold tracking-tight text-white">Scan Challenges</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Reward regulars automatically: when a member reaches a scan goal within a week, they earn giveaway entries.
        </p>
      </div>

      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div> : null}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Add or edit challenges</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Set scan goals (e.g. 3 scans → 1 entry, 5 scans → a bonus entry) and point them at a giveaway.
            </p>
          </div>
          <button
            type="button"
            onClick={startCreate}
            className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-300 active:scale-[0.98]"
          >
            Add challenge
          </button>
        </div>
      </section>

      {isFormModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 md:items-center md:p-6" role="dialog" aria-modal="true">
          <section className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-[#101116] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{form.id ? "Edit challenge" : "Create challenge"}</h2>
              <button
                type="button"
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-white/5 active:scale-[0.98]"
                onClick={() => setIsFormModalOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-zinc-300">
                <div className="mb-1">Title</div>
                <input
                  className={inputClass}
                  placeholder="e.g. 3 scans a week"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                />
              </label>
              <label className="text-sm text-zinc-300">
                <div className="mb-1">Status</div>
                <select
                  className={inputClass}
                  value={form.active ? "active" : "inactive"}
                  onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.value === "active" }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Paused</option>
                </select>
              </label>
            </div>

            {/* Tiers */}
            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-1 text-sm font-medium text-zinc-100">Goals (tiers)</div>
              <p className="mb-3 text-xs text-zinc-400">
                Each tier grants its own entries when reached. Example: 3 scans → 1 entry, then 5 scans → 1 more.
              </p>
              <div className="space-y-2">
                {form.thresholds.map((tier, index) => (
                  <div key={index} className="flex items-end gap-2">
                    <label className="text-xs text-zinc-300">
                      <div className="mb-1">Scans</div>
                      <input
                        type="number"
                        min={1}
                        className="h-10 w-24 rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400"
                        value={tier.scanCount}
                        onChange={(e) =>
                          setForm((prev) => {
                            const next = [...prev.thresholds];
                            next[index] = { ...next[index], scanCount: e.target.value };
                            return { ...prev, thresholds: next };
                          })
                        }
                      />
                    </label>
                    <span className="pb-2.5 text-zinc-500">→</span>
                    <label className="text-xs text-zinc-300">
                      <div className="mb-1">Entries</div>
                      <input
                        type="number"
                        min={1}
                        className="h-10 w-24 rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400"
                        value={tier.entries}
                        onChange={(e) =>
                          setForm((prev) => {
                            const next = [...prev.thresholds];
                            next[index] = { ...next[index], entries: e.target.value };
                            return { ...prev, thresholds: next };
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="mb-0.5 rounded-lg border border-white/15 px-3 py-2 text-xs text-zinc-300 transition hover:bg-white/5 active:scale-[0.98] disabled:opacity-40"
                      disabled={form.thresholds.length <= 1}
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          thresholds: prev.thresholds.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="mt-3 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-white/5 active:scale-[0.98]"
                onClick={() =>
                  setForm((prev) => ({ ...prev, thresholds: [...prev.thresholds, { scanCount: "", entries: "1" }] }))
                }
              >
                Add tier
              </button>
            </div>

            {/* Window + counting */}
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-sm text-zinc-300">
                <div className="mb-1">Time window</div>
                <select
                  className={inputClass}
                  value={form.windowType}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, windowType: e.target.value as FormState["windowType"] }))
                  }
                >
                  <option value="calendar_week">Resetting week</option>
                  <option value="challenge_period">Entire challenge period</option>
                  <option value="rolling_days">Rolling day window</option>
                </select>
              </label>
              {form.windowType === "calendar_week" ? (
                <label className="text-sm text-zinc-300">
                  <div className="mb-1">Week starts on</div>
                  <select
                    className={inputClass}
                    value={form.weekStartsOn}
                    onChange={(e) => setForm((prev) => ({ ...prev, weekStartsOn: e.target.value }))}
                  >
                    {WEEKDAYS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : form.windowType === "challenge_period" ? (
                <div className="text-sm text-zinc-300">
                  <div className="mb-1">One goal for the whole run</div>
                  <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400">
                    Scans are counted across the challenge&rsquo;s start and end dates as a single total. A start
                    date is required below.
                  </p>
                </div>
              ) : (
                <label className="text-sm text-zinc-300">
                  <div className="mb-1">Window length (days)</div>
                  <input
                    type="number"
                    min={1}
                    max={366}
                    className={inputClass}
                    value={form.rollingDays}
                    onChange={(e) => setForm((prev) => ({ ...prev, rollingDays: e.target.value }))}
                  />
                </label>
              )}
              <label className="text-sm text-zinc-300">
                <div className="mb-1">Timezone</div>
                <select
                  className={inputClass}
                  value={form.timezone}
                  onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-zinc-300">
                <div className="mb-1">What counts as progress</div>
                <select
                  className={inputClass}
                  value={form.countMode}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, countMode: e.target.value as FormState["countMode"] }))
                  }
                >
                  <option value="claims">Every valid scan (even repeats)</option>
                  <option value="distinct_events">Different scan events only</option>
                </select>
              </label>
            </div>

            {/* Giveaway target */}
            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-1 text-sm font-medium text-zinc-100">Where entries go</div>
              <label className="mt-1 block text-sm text-zinc-300">
                <div className="mb-1">Target</div>
                <select
                  className={inputClass}
                  value={form.giveawayTargetMode}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      giveawayTargetMode: e.target.value as "selected" | "all_active",
                    }))
                  }
                >
                  <option value="selected">Selected giveaways</option>
                  <option value="all_active">All active giveaways</option>
                </select>
              </label>
              {form.giveawayTargetMode === "selected" ? (
                <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-white/5 p-2">
                  {giveaways.length === 0 ? (
                    <div className="text-xs text-zinc-500">No active or draft giveaways available.</div>
                  ) : (
                    giveaways.map((item) => {
                      const checked = form.giveawayIds.includes(item.id);
                      return (
                        <label key={item.id} className="flex items-center gap-2 text-xs text-zinc-200">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setForm((prev) => ({ ...prev, giveawayIds: toggleId(prev.giveawayIds, item.id, e.target.checked) }))
                            }
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
            </div>

            {/* Dates */}
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-sm text-zinc-300">
                <div className="mb-1">Starts (optional)</div>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={form.startsAt}
                  onChange={(e) => setForm((prev) => ({ ...prev, startsAt: e.target.value }))}
                />
              </label>
              <label className="text-sm text-zinc-300">
                <div className="mb-1">Ends (optional)</div>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={form.endsAt}
                  onChange={(e) => setForm((prev) => ({ ...prev, endsAt: e.target.value }))}
                />
              </label>
            </div>

            {/* Advanced scope */}
            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <button
                type="button"
                className="flex w-full items-center justify-between text-sm font-medium text-zinc-100"
                onClick={() => setShowScope((v) => !v)}
              >
                <span>Which scans count (optional)</span>
                <span className="text-xs text-zinc-400">{showScope ? "Hide" : "Show"}</span>
              </button>
              {showScope ? (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-zinc-400">
                    Leave everything empty and <span className="text-zinc-200">all scans count</span>. Add filters to
                    restrict the challenge to specific scan events, businesses, locations, or charities.
                  </p>
                  <label className="text-sm text-zinc-300">
                    <div className="mb-1">Match rule</div>
                    <select
                      className={inputClass}
                      value={form.scopeMatchMode}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, scopeMatchMode: e.target.value as "all" | "any" }))
                      }
                    >
                      <option value="all">Scan must match ALL selected filters</option>
                      <option value="any">Scan must match ANY selected filter</option>
                    </select>
                  </label>

                  <ScopePicker
                    label="Scan events"
                    options={scanEvents.map((s) => ({ id: s.id, label: s.title }))}
                    selected={form.scopeScanEventIds}
                    onToggle={(id, checked) =>
                      setForm((prev) => ({ ...prev, scopeScanEventIds: toggleId(prev.scopeScanEventIds, id, checked) }))
                    }
                  />
                  <ScopePicker
                    label="Businesses"
                    options={businesses.map((b) => ({ id: b.id, label: b.name }))}
                    selected={form.scopeBusinessIds}
                    onToggle={(id, checked) =>
                      setForm((prev) => ({ ...prev, scopeBusinessIds: toggleId(prev.scopeBusinessIds, id, checked) }))
                    }
                  />
                  <ScopePicker
                    label="Locations"
                    options={locationOptions}
                    selected={form.scopeLocationIds}
                    onToggle={(id, checked) =>
                      setForm((prev) => ({ ...prev, scopeLocationIds: toggleId(prev.scopeLocationIds, id, checked) }))
                    }
                  />
                  <ScopePicker
                    label="Charities"
                    options={causes.map((c) => ({ id: c.id, label: c.title }))}
                    selected={form.scopeCauseIds}
                    onToggle={(id, checked) =>
                      setForm((prev) => ({ ...prev, scopeCauseIds: toggleId(prev.scopeCauseIds, id, checked) }))
                    }
                  />
                </div>
              ) : null}
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
                {saving ? "Saving..." : form.id ? "Update challenge" : "Create challenge"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Existing challenges</h2>
        {loading ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">Loading...</div>
        ) : challenges.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400">
            No scan challenges yet. Create one to reward members for scanning regularly.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {challenges.map((challenge) => (
              <article key={challenge.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-white">{challenge.title}</h3>
                    <p className="text-xs text-zinc-500">
                      <span className={challenge.active ? "text-emerald-300" : "text-amber-300"}>
                        {challenge.active ? "Active" : "Paused"}
                      </span>{" "}
                      ·{" "}
                      {challenge.giveaway.targetMode === "all_active"
                        ? "all active giveaways"
                        : `${challenge.giveaway.giveawayIds.length} giveaway${challenge.giveaway.giveawayIds.length === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => hydrate(challenge)}
                      className="rounded-lg border border-white/15 px-3 py-1 text-xs text-zinc-200 transition hover:bg-white/5 active:scale-[0.98]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busyId === challenge.id}
                      onClick={() => void toggleActive(challenge)}
                      className="rounded-lg border border-white/15 px-3 py-1 text-xs text-zinc-200 transition hover:bg-white/5 active:scale-[0.98] disabled:opacity-50"
                    >
                      {challenge.active ? "Pause" : "Activate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => openBackfill(challenge)}
                      className={`rounded-lg border px-3 py-1 text-xs transition active:scale-[0.98] ${
                        backfillOpenId === challenge.id
                          ? "border-amber-300/70 bg-amber-400/15 text-amber-100"
                          : "border-white/15 text-zinc-200 hover:bg-white/5"
                      }`}
                    >
                      {backfillOpenId === challenge.id ? "Close backfill" : "Backfill"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === challenge.id}
                      onClick={() => void remove(challenge)}
                      className="rounded-lg border border-red-500/30 px-3 py-1 text-xs text-red-200 transition hover:bg-red-500/10 active:scale-[0.98] disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-sm text-zinc-300">{summarize(challenge)}</p>
                {(challenge.startsAt || challenge.endsAt) ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    {challenge.startsAt ? `From ${new Date(challenge.startsAt).toLocaleString()}` : ""}
                    {challenge.startsAt && challenge.endsAt ? " " : ""}
                    {challenge.endsAt ? `Until ${new Date(challenge.endsAt).toLocaleString()}` : ""}
                  </p>
                ) : null}

                {backfillOpenId === challenge.id ? (
                  <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/[0.05] p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-200">
                      Backfill past scans into entries
                    </p>
                    <p className="mb-3 text-xs text-zinc-400">
                      Looks back over scan history in the date range and awards entries to anyone who qualifies —
                      for members who already met the goal but haven’t scanned since. Always <strong>Preview</strong> first;
                      it’s safe to re-run (existing entries are skipped).
                    </p>

                    <p className="mb-3 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-zinc-400">
                      {challenge.window.type === "challenge_period"
                        ? "This challenge counts one total across its whole start–end period, so the backfill uses the challenge's own dates."
                        : challenge.window.type === "rolling_days"
                          ? "Rolling-day challenges can't be backfilled — switch the challenge's time window first."
                          : "Counted per week (matching the challenge's weekly reset). Weeks that overlap your date range are included in full."}
                    </p>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {challenge.window.type !== "challenge_period" ? (
                        <>
                          <label className="text-xs text-zinc-300">
                            <div className="mb-1 font-medium text-zinc-100">Start</div>
                            <input
                              type="datetime-local"
                              className="h-9 w-full rounded border border-white/10 bg-black/40 px-2 text-xs text-white outline-none focus:border-amber-300"
                              value={bf.startDate}
                              onChange={(e) => setBf((p) => ({ ...p, startDate: e.target.value }))}
                            />
                          </label>
                          <label className="text-xs text-zinc-300">
                            <div className="mb-1 font-medium text-zinc-100">End</div>
                            <input
                              type="datetime-local"
                              className="h-9 w-full rounded border border-white/10 bg-black/40 px-2 text-xs text-white outline-none focus:border-amber-300"
                              value={bf.endDate}
                              onChange={(e) => setBf((p) => ({ ...p, endDate: e.target.value }))}
                            />
                          </label>
                        </>
                      ) : null}
                      <label className="text-xs text-zinc-300">
                        <div className="mb-1 font-medium text-zinc-100">What counts</div>
                        <select
                          className="h-9 w-full rounded border border-white/10 bg-black/40 px-2 text-xs text-white outline-none focus:border-amber-300"
                          value={bf.countMode}
                          onChange={(e) => setBf((p) => ({ ...p, countMode: e.target.value as "distinct_events" | "claims" }))}
                        >
                          <option value="claims">Every valid scan (even repeats)</option>
                          <option value="distinct_events">Different scan events only</option>
                        </select>
                      </label>
                    </div>

                    <div className="mt-3">
                      <div className="mb-1 text-xs font-medium text-zinc-100">Tiers</div>
                      <div className="space-y-1.5">
                        {bf.thresholds.map((tier, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              className="h-8 w-20 rounded border border-white/10 bg-black/40 px-2 text-xs text-white outline-none focus:border-amber-300"
                              value={tier.scanCount}
                              onChange={(e) =>
                                setBf((p) => {
                                  const next = [...p.thresholds];
                                  next[index] = { ...next[index], scanCount: e.target.value };
                                  return { ...p, thresholds: next };
                                })
                              }
                            />
                            <span className="text-xs text-zinc-500">scans →</span>
                            <input
                              type="number"
                              min={1}
                              className="h-8 w-20 rounded border border-white/10 bg-black/40 px-2 text-xs text-white outline-none focus:border-amber-300"
                              value={tier.entries}
                              onChange={(e) =>
                                setBf((p) => {
                                  const next = [...p.thresholds];
                                  next[index] = { ...next[index], entries: e.target.value };
                                  return { ...p, thresholds: next };
                                })
                              }
                            />
                            <span className="text-xs text-zinc-500">entries</span>
                            <button
                              type="button"
                              className="rounded border border-white/15 px-2 py-1 text-xs text-zinc-300 transition hover:bg-white/5 disabled:opacity-40"
                              disabled={bf.thresholds.length <= 1}
                              onClick={() => setBf((p) => ({ ...p, thresholds: p.thresholds.filter((_, i) => i !== index) }))}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="mt-2 rounded border border-white/15 px-2 py-1 text-xs text-zinc-200 transition hover:bg-white/5"
                        onClick={() => setBf((p) => ({ ...p, thresholds: [...p.thresholds, { scanCount: "", entries: "1" }] }))}
                      >
                        Add tier
                      </button>
                    </div>

                    <div className="mt-3">
                      <div className="mb-1 text-xs font-medium text-zinc-100">Entries go to</div>
                      <select
                        className="h-9 w-full rounded border border-white/10 bg-black/40 px-2 text-xs text-white outline-none focus:border-amber-300"
                        value={bf.targetMode}
                        onChange={(e) => setBf((p) => ({ ...p, targetMode: e.target.value as "selected" | "all_active" }))}
                      >
                        <option value="selected">Selected giveaways</option>
                        <option value="all_active">All active giveaways</option>
                      </select>
                      {bf.targetMode === "selected" ? (
                        <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded border border-white/10 bg-black/30 p-2">
                          {giveaways.length === 0 ? (
                            <div className="text-xs text-zinc-500">No active or draft giveaways available.</div>
                          ) : (
                            giveaways.map((g) => {
                              const checked = bf.giveawayIds.includes(g.id);
                              return (
                                <label key={g.id} className="flex items-center gap-2 text-xs text-zinc-200">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) =>
                                      setBf((p) => ({ ...p, giveawayIds: toggleId(p.giveawayIds, g.id, e.target.checked) }))
                                    }
                                  />
                                  <span>
                                    {g.title} ({g.status})
                                  </span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      ) : null}
                    </div>

                    {bfError ? (
                      <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">{bfError}</div>
                    ) : null}
                    {bfResult ? (
                      <div className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-200">{bfResult}</div>
                    ) : null}

                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void runBackfill(challenge.id, "preview")}
                        disabled={bfBusy || challenge.window.type === "rolling_days"}
                        className="rounded border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:bg-white/5 disabled:opacity-60"
                      >
                        {bfBusy ? "Working…" : "Preview"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runBackfill(challenge.id, "commit")}
                        disabled={bfBusy || challenge.window.type === "rolling_days"}
                        className="rounded bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-amber-300 disabled:opacity-60"
                      >
                        {bfBusy ? "Working…" : "Run backfill"}
                      </button>
                    </div>
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

function ScopePicker({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-100">
        {label}
        {selected.length > 0 ? <span className="ml-1 text-emerald-300">({selected.length})</span> : null}
      </div>
      <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-2">
        {options.length === 0 ? (
          <div className="text-xs text-zinc-500">None available.</div>
        ) : (
          options.map((opt) => (
            <label key={opt.id} className="flex items-center gap-2 text-xs text-zinc-200">
              <input
                type="checkbox"
                checked={selected.includes(opt.id)}
                onChange={(e) => onToggle(opt.id, e.target.checked)}
              />
              <span>{opt.label}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
