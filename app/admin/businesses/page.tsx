"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { slugify } from "@/lib/utils/slugify";
import type { BusinessDoc, LocationDoc } from "@/lib/types/business";

type BusinessNode = {
  id: string;
  data: BusinessDoc;
  locations: (LocationDoc & { id: string })[];
};

type CauseLink = {
  id: string;
  title?: string;
  description?: string;
  slug?: string;
  linked?: boolean;
  selectedLocationIds?: string[];
};

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm text-zinc-200">
      <div className="mb-1 font-semibold text-white">{label}</div>
      <input
        className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-white outline-none placeholder:text-zinc-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/40"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block text-sm text-zinc-200">
      <div className="mb-1 font-semibold text-white">{label}</div>
      <select
        className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-white outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/40"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select…</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function AdminBusinessesPage() {
  const [businesses, setBusinesses] = useState<BusinessNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const [expandedSection, setExpandedSection] = useState<"create" | "locations" | "causes">(
    "create",
  );
  const [staffEmail, setStaffEmail] = useState("");
  const [staffBusinessId, setStaffBusinessId] = useState("");
  const [staffRole, setStaffRole] = useState<"owner" | "staff">("staff");
  const [staffSubmitting, setStaffSubmitting] = useState(false);
  const [staffMessage, setStaffMessage] = useState<string | null>(null);
  const [staffMembers, setStaffMembers] = useState<
    { uid: string; email: string | null; role: string }[]
  >([]);

  // business form
  const [bizName, setBizName] = useState("");
  const [bizDescription, setBizDescription] = useState("");
  const [bizSlug, setBizSlug] = useState("");
  const [bizSubmitting, setBizSubmitting] = useState(false);

  // location form
  const [locBusinessId, setLocBusinessId] = useState("");
  const [locName, setLocName] = useState("");
  const [locSlug, setLocSlug] = useState("");
  const [locSubmitting, setLocSubmitting] = useState(false);

  // cause assignment
  const [causeBusinessId, setCauseBusinessId] = useState("");
  const [causeAssignments, setCauseAssignments] = useState<Record<string, CauseLink[]>>({});
  const [causeLoadingId, setCauseLoadingId] = useState<string | null>(null);
  const [causeSavingId, setCauseSavingId] = useState<string | null>(null);
  const [causeMessage, setCauseMessage] = useState<string | null>(null);

  const businessOptions = useMemo(
    () => businesses.map((b) => ({ value: b.id, label: b.data.name })),
    [businesses],
  );

  const currentBusiness = useMemo(
    () => businesses.find((b) => b.id === causeBusinessId),
    [businesses, causeBusinessId],
  );

  const fetchCauseLinks = useCallback(
    async (businessId: string) => {
      if (!user) return;
      setCauseLoadingId(businessId);
      setCauseMessage(null);
      try {
        const idToken = await user.getIdToken();
        const res = await fetch(`/api/business/${businessId}/cause-links`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as { causes?: CauseLink[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to load causes.");
        setCauseAssignments((prev) => ({ ...prev, [businessId]: json.causes ?? [] }));
      } catch (err) {
        setCauseMessage(err instanceof Error ? err.message : "Failed to load causes.");
      } finally {
        setCauseLoadingId(null);
      }
    },
    [user],
  );

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const bizSnap = await getDocs(collection(firestore, "businesses"));
      const next: BusinessNode[] = [];
      for (const docSnap of bizSnap.docs) {
        const data = docSnap.data() as BusinessDoc;
        const businessId = docSnap.id;
        const locationsSnap = await getDocs(
          collection(firestore, "businesses", businessId, "locations"),
        );
        next.push({
          id: businessId,
          data,
          locations: locationsSnap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as LocationDoc),
          })),
        });
      }
      setBusinesses(next);
      setCauseBusinessId((prev) => prev || next[0]?.id || "");
      await Promise.all(next.map((biz) => fetchCauseLinks(biz.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load businesses.");
    } finally {
      setLoading(false);
    }
  }, [fetchCauseLinks, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!causeBusinessId || causeAssignments[causeBusinessId]) return;
    void fetchCauseLinks(causeBusinessId);
  }, [causeAssignments, causeBusinessId, fetchCauseLinks]);

  async function submitBusiness(e: React.FormEvent) {
    e.preventDefault();
    setBizSubmitting(true);
    setError(null);
    try {
      const slug = (bizSlug || slugify(bizName)).toLowerCase();
      const ref = doc(firestore, "businesses", slug);
      await setDoc(ref, {
        name: bizName,
        description: bizDescription,
        slug,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } satisfies BusinessDoc);
      setBizName("");
      setBizDescription("");
      setBizSlug("");
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create business.");
    } finally {
      setBizSubmitting(false);
    }
  }

  async function submitLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!locBusinessId) {
      setError("Select a business for the location.");
      return;
    }
    setLocSubmitting(true);
    setError(null);
    try {
      const slug = (locSlug || slugify(locName)).toLowerCase();
      const ref = doc(firestore, "businesses", locBusinessId, "locations", slug);
      await setDoc(ref, {
        businessId: locBusinessId,
        name: locName,
        slug,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } satisfies LocationDoc);
      setLocName("");
      setLocSlug("");
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create location.");
    } finally {
      setLocSubmitting(false);
    }
  }

  const donationCombos = useMemo(() => {
    return businesses.flatMap((biz) => {
      const links = causeAssignments[biz.id]?.filter((c) => c.linked) ?? [];
      return links.flatMap((cause) => {
        const allowed = cause.selectedLocationIds?.length
          ? biz.locations.filter((loc) => cause.selectedLocationIds?.includes(loc.id))
          : biz.locations;
        return allowed.map((loc) => ({
          business: biz,
          cause,
          location: loc,
          url: `/donate/${biz.data.slug}/${cause.slug ?? cause.id}/${loc.slug}`,
        }));
      });
    });
  }, [businesses, causeAssignments]);

  async function saveLocations(causeId: string) {
    if (!user || !causeBusinessId) {
      setCauseMessage("Select a business first.");
      return;
    }
    const selected = causeAssignments[causeBusinessId]?.find((c) => c.id === causeId)
      ?.selectedLocationIds ?? [];
    setCauseSavingId(causeId);
    setCauseMessage(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/business/${causeBusinessId}/cause-links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ causeId, locationIds: selected }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to save link.");
      setCauseMessage("Saved cause placements.");
    } catch (err) {
      setCauseMessage(err instanceof Error ? err.message : "Failed to save link.");
    } finally {
      setCauseSavingId(null);
    }
  }

  function toggleLocation(causeId: string, locationId: string) {
    if (!causeBusinessId) return;
    setCauseAssignments((prev) => {
      const list = prev[causeBusinessId] ?? [];
      return {
        ...prev,
        [causeBusinessId]: list.map((c) =>
          c.id === causeId
            ? {
                ...c,
                selectedLocationIds: c.selectedLocationIds?.includes(locationId)
                  ? (c.selectedLocationIds ?? []).filter((id) => id !== locationId)
                  : [...(c.selectedLocationIds ?? []), locationId],
                linked: true,
              }
            : c,
        ),
      };
    });
  }

  function enableAllLocations(causeId: string) {
    if (!causeBusinessId) return;
    const allIds = currentBusiness?.locations.map((l) => l.id) ?? [];
    setCauseAssignments((prev) => {
      const list = prev[causeBusinessId] ?? [];
      return {
        ...prev,
        [causeBusinessId]: list.map((c) =>
          c.id === causeId
            ? {
                ...c,
                linked: true,
                selectedLocationIds: allIds,
              }
            : c,
        ),
      };
    });
  }

  async function removeLink(causeId: string) {
    if (!user || !causeBusinessId) return;
    setCauseSavingId(causeId);
    setCauseMessage(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/business/${causeBusinessId}/cause-links`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ causeId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to remove link.");
      setCauseAssignments((prev) => {
        const list = prev[causeBusinessId] ?? [];
        return {
          ...prev,
          [causeBusinessId]: list.map((c) =>
            c.id === causeId ? { ...c, linked: false, selectedLocationIds: [] } : c,
          ),
        };
      });
      setCauseMessage("Removed from business.");
    } catch (err) {
      setCauseMessage(err instanceof Error ? err.message : "Failed to remove link.");
    } finally {
      setCauseSavingId(null);
    }
  }

  async function loadStaff(businessId: string) {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin/businesses/${businessId}/staff/list`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = (await res.json()) as {
        members?: { uid: string; email: string | null; role: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load staff.");
      setStaffMembers(json.members ?? []);
    } catch (err) {
      setStaffMessage(err instanceof Error ? err.message : "Failed to load staff.");
    }
  }

  useEffect(() => {
    if (staffBusinessId) void loadStaff(staffBusinessId);
    else setStaffMembers([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffBusinessId, user]);

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!staffBusinessId) {
      setStaffMessage("Pick a business.");
      return;
    }
    if (!user) {
      setStaffMessage("Sign in again and try.");
      return;
    }
    setStaffSubmitting(true);
    setStaffMessage(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin/businesses/${staffBusinessId}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ email: staffEmail, role: staffRole }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to add staff.");
      setStaffMessage("Staff access granted.");
      setStaffEmail("");
      void loadStaff(staffBusinessId);
    } catch (err) {
      setStaffMessage(err instanceof Error ? err.message : "Failed to add staff.");
    } finally {
      setStaffSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 text-white">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">Businesses & Locations</h1>
        <p className="mt-2 text-sm text-zinc-300">
          Create businesses, add locations, and assign global causes to each location for donations.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                expandedSection === "create"
                  ? "border-emerald-300 bg-emerald-300 text-emerald-950 shadow-lg shadow-emerald-400/30"
                  : "border-white/15 bg-white/5 text-white hover:border-white/25"
              }`}
              onClick={() => setExpandedSection("create")}
            >
              Create business
            </button>
            <button
              type="button"
              className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                expandedSection === "locations"
                  ? "border-emerald-300 bg-emerald-300 text-emerald-950 shadow-lg shadow-emerald-400/30"
                  : "border-white/15 bg-white/5 text-white hover:border-white/25"
              }`}
              onClick={() => setExpandedSection("locations")}
            >
              Add location
            </button>
            <button
              type="button"
              className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                expandedSection === "causes"
                  ? "border-emerald-300 bg-emerald-300 text-emerald-950 shadow-lg shadow-emerald-400/30"
                  : "border-white/15 bg-white/5 text-white hover:border-white/25"
              }`}
              onClick={() => setExpandedSection("causes")}
            >
              Assign causes to locations
            </button>
          </div>

          {expandedSection === "create" ? (
            <form
              onSubmit={submitBusiness}
              className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur"
            >
              <div className="text-sm font-semibold text-white">Create business</div>
              <TextInput label="Name" value={bizName} onChange={setBizName} />
              <TextInput
                label="Description (optional)"
                value={bizDescription}
                onChange={setBizDescription}
              />
              <TextInput
                label="Slug (optional)"
                value={bizSlug}
                onChange={setBizSlug}
                placeholder="auto-generated from name"
              />
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-full bg-emerald-400 px-5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-60"
                disabled={bizSubmitting}
              >
                {bizSubmitting ? "Creating…" : "Create business"}
              </button>
            </form>
          ) : null}

          {expandedSection === "locations" ? (
            <form
              onSubmit={submitLocation}
              className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur"
            >
              <div className="text-sm font-semibold text-white">Add location</div>
              <Select
                label="Business"
                value={locBusinessId}
                onChange={setLocBusinessId}
                options={businessOptions}
              />
              <TextInput label="Name" value={locName} onChange={setLocName} />
              <TextInput
                label="Slug (optional)"
                value={locSlug}
                onChange={setLocSlug}
                placeholder="auto-generated from name"
              />
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-full bg-emerald-400 px-5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-60"
                disabled={locSubmitting}
              >
                {locSubmitting ? "Saving…" : "Add location"}
              </button>
            </form>
          ) : null}

          {expandedSection === "causes" ? (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur">
              <div className="text-sm font-semibold text-white">Assign causes to locations</div>
              <Select
                label="Business"
                value={causeBusinessId}
                onChange={(v) => {
                  setCauseBusinessId(v);
                  setCauseMessage(null);
                }}
                options={businessOptions}
              />
              {causeBusinessId ? (
                <div className="space-y-3">
                  {causeLoadingId === causeBusinessId ? (
                    <div className="text-sm text-zinc-300">Loading causes…</div>
                  ) : (causeAssignments[causeBusinessId] ?? []).length === 0 ? (
                    <div className="text-sm text-zinc-300">
                      No causes available yet. Add causes in the Causes section first.
                    </div>
                  ) : (
                    (causeAssignments[causeBusinessId] ?? []).map((cause) => (
                      <div
                        key={cause.id}
                        className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3 shadow-inner shadow-black/20"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">
                              {cause.title ?? cause.id}
                            </div>
                            {cause.description ? (
                              <div className="text-xs text-zinc-300">{cause.description}</div>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white hover:border-white/25"
                              onClick={() => {
                                enableAllLocations(cause.id);
                                void saveLocations(cause.id);
                              }}
                              disabled={causeSavingId === cause.id}
                            >
                              {cause.linked ? "Save all locations" : "Add (all locations)"}
                            </button>
                            <button
                              type="button"
                              className="text-xs font-semibold text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
                              onClick={() => saveLocations(cause.id)}
                              disabled={causeSavingId === cause.id}
                            >
                              {causeSavingId === cause.id ? "Saving…" : "Save"}
                            </button>
                            {cause.linked ? (
                              <button
                                type="button"
                                className="text-xs font-semibold text-red-300 underline underline-offset-2 hover:text-red-200"
                                onClick={() => removeLink(cause.id)}
                                disabled={causeSavingId === cause.id}
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-xs uppercase tracking-wide text-zinc-400">
                          Locations {cause.linked ? "(enabled)" : "(not added yet)"}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {currentBusiness?.locations.map((loc) => {
                            const checked = cause.selectedLocationIds?.includes(loc.id);
                            return (
                              <label
                                key={loc.id}
                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                                  checked
                                    ? "border-emerald-300 bg-emerald-300 text-emerald-950 shadow-lg shadow-emerald-400/30"
                                    : "border-white/15 bg-white/5 text-white hover:border-white/25"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="hidden"
                                  checked={checked}
                                  onChange={() => toggleLocation(cause.id, loc.id)}
                                />
                                {loc.name}
                              </label>
                            );
                          })}
                        </div>
                        <div className="text-xs text-zinc-400">
                          Save to generate donation URLs for the selected locations. Use &quot;Remove&quot; to
                          detach this charity from the business.
                        </div>
                      </div>
                    ))
                  )}
                  {causeMessage ? (
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200">
                      {causeMessage}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-zinc-300">Select a business to manage causes.</div>
              )}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white shadow-xl shadow-black/20 backdrop-blur">
            <div className="text-sm font-semibold text-white">Donation URLs (per location & cause)</div>
            {loading ? (
              <div className="mt-2 text-zinc-300">Loading…</div>
            ) : donationCombos.length === 0 ? (
              <div className="mt-2 text-zinc-300">None yet.</div>
            ) : (
              <div className="mt-3 space-y-2">
                {donationCombos.map((combo) => (
                  <div
                    key={`${combo.business.id}-${combo.cause.id}-${combo.location.id}`}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 shadow-inner shadow-black/30"
                  >
                    <div className="text-xs uppercase tracking-wide text-zinc-400">
                      {combo.business.data.name} · {combo.location.name}
                    </div>
                    <div className="text-sm font-semibold text-white">{combo.cause.title}</div>
                    <div className="text-xs text-zinc-300">{combo.url}</div>
                    <div className="text-xs text-zinc-400">
                      QR tokens are required for donations. Use the QR print pages to generate the
                      secure links.
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white shadow-xl shadow-black/20 backdrop-blur">
            <div className="text-sm font-semibold text-white">Business staff</div>
            <form className="mt-3 space-y-2" onSubmit={addStaff}>
              <Select
                label="Business"
                value={staffBusinessId}
                onChange={(v) => setStaffBusinessId(v)}
                options={businessOptions}
              />
              <TextInput
                label="Staff email"
                value={staffEmail}
                onChange={setStaffEmail}
                placeholder="user@example.com"
              />
              <div className="flex items-center gap-3 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="role"
                    value="staff"
                    checked={staffRole === "staff"}
                    onChange={() => setStaffRole("staff")}
                  />
                  Staff
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="role"
                    value="owner"
                    checked={staffRole === "owner"}
                    onChange={() => setStaffRole("owner")}
                  />
                  Owner
                </label>
              </div>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-full bg-emerald-400 px-5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-60"
                disabled={staffSubmitting}
              >
                {staffSubmitting ? "Saving…" : "Grant access"}
              </button>
            </form>
            {staffMessage ? (
              <div className="mt-2 text-xs text-zinc-300">{staffMessage}</div>
            ) : null}
            {staffMembers.length > 0 ? (
              <div className="mt-3 space-y-2">
                {staffMembers.map((m) => (
                  <div
                    key={m.uid}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white shadow-inner shadow-black/30"
                  >
                    <div className="font-medium">{m.email ?? m.uid}</div>
                    <div className="text-zinc-400">Role: {m.role}</div>
                  </div>
                ))}
              </div>
            ) : staffBusinessId ? (
              <div className="mt-3 text-xs text-zinc-300">No staff yet.</div>
            ) : null}
          </div>
        </div>
      </div>

      <Link
        className="text-sm font-semibold text-emerald-300 underline hover:text-emerald-200"
        href="/admin"
      >
        ← Back to admin overview
      </Link>
    </div>
  );
}
