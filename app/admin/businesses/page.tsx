"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { firebaseStorage, firestore } from "@/lib/firebase/client";
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

type SubAction =
  | "addLocation"
  | "causesFullView"
  | "uploadLogo"
  | "uploadLocationLogo"
  | "donationUrls"
  | "qrLinks"
  | null;

const INPUT_CLS =
  "h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400";
const BTN_PRIMARY =
  "inline-flex h-10 items-center justify-center rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60";

export default function AdminBusinessesPage() {
  const [businesses, setBusinesses] = useState<BusinessNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  // Dashboard state
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [activeSubAction, setActiveSubAction] = useState<SubAction>(null);

  // Business create form
  const [bizName, setBizName] = useState("");
  const [bizDescription, setBizDescription] = useState("");
  const [bizSlug, setBizSlug] = useState("");
  const [bizSubmitting, setBizSubmitting] = useState(false);

  // Location form
  const [locName, setLocName] = useState("");
  const [locSlug, setLocSlug] = useState("");
  const [locSubmitting, setLocSubmitting] = useState(false);

  // Cause assignment
  const [causeAssignments, setCauseAssignments] = useState<Record<string, CauseLink[]>>({});
  const [causeLoadingId, setCauseLoadingId] = useState<string | null>(null);
  const [causeSavingId, setCauseSavingId] = useState<string | null>(null);
  const [causeMessage, setCauseMessage] = useState<string | null>(null);

  // Logo upload
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);

  // Location logo upload
  const [locationLogoId, setLocationLogoId] = useState("");
  const [locationLogoFile, setLocationLogoFile] = useState<File | null>(null);
  const [locationLogoUploading, setLocationLogoUploading] = useState(false);
  const [locationLogoMessage, setLocationLogoMessage] = useState<string | null>(null);

  /* ── Memos ── */

  const filtered = useMemo(
    () => businesses.filter((b) => b.data.name.toLowerCase().includes(search.toLowerCase())),
    [businesses, search],
  );

  const currentBusiness = useMemo(
    () => businesses.find((b) => b.id === expandedId),
    [businesses, expandedId],
  );

  const stats = useMemo(() => {
    const locCount = businesses.reduce((s, b) => s + b.locations.length, 0);
    const causeSet = new Set<string>();
    for (const biz of businesses) {
      for (const c of causeAssignments[biz.id] ?? []) {
        if (c.linked) causeSet.add(c.id);
      }
    }
    return [
      { label: "Businesses", value: String(businesses.length) },
      { label: "Locations", value: String(locCount) },
      { label: "Active Causes", value: String(causeSet.size) },
    ];
  }, [businesses, causeAssignments]);

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

  /* ── Core functions ── */

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
      await Promise.all(next.map((biz) => fetchCauseLinks(biz.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load businesses.");
    } finally {
      setLoading(false);
    }
  }, [fetchCauseLinks, user]);

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
      setShowNewForm(false);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create business.");
    } finally {
      setBizSubmitting(false);
    }
  }

  async function submitLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!expandedId) {
      setError("Expand a business first.");
      return;
    }
    setLocSubmitting(true);
    setError(null);
    try {
      const slug = (locSlug || slugify(locName)).toLowerCase();
      const ref = doc(firestore, "businesses", expandedId, "locations", slug);
      await setDoc(ref, {
        businessId: expandedId,
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

  async function submitLogo(e: React.FormEvent) {
    e.preventDefault();
    if (!expandedId) {
      setLogoMessage("Expand a business first.");
      return;
    }
    if (!logoFile) {
      setLogoMessage("Choose an image to upload.");
      return;
    }
    setLogoUploading(true);
    setLogoMessage(null);
    try {
      const ext = logoFile.name.split(".").pop() || "png";
      const path = `business-logos/${expandedId}/${Date.now()}.${ext}`;
      const logoRef = storageRef(firebaseStorage, path);
      await uploadBytes(logoRef, logoFile, {
        contentType: logoFile.type || "image/png",
      });
      const logoUrl = await getDownloadURL(logoRef);
      await updateDoc(doc(firestore, "businesses", expandedId), {
        logoPath: path,
        logoUrl,
        updatedAt: serverTimestamp(),
      } satisfies Partial<BusinessDoc>);
      setLogoFile(null);
      setLogoMessage("Logo uploaded.");
      void load();
    } catch (err) {
      setLogoMessage(err instanceof Error ? err.message : "Failed to upload logo.");
    } finally {
      setLogoUploading(false);
    }
  }

  async function submitLocationLogo(e: React.FormEvent) {
    e.preventDefault();
    if (!expandedId) {
      setLocationLogoMessage("Expand a business first.");
      return;
    }
    if (!locationLogoId) {
      setLocationLogoMessage("Select a location.");
      return;
    }
    if (!locationLogoFile) {
      setLocationLogoMessage("Choose an image to upload.");
      return;
    }
    setLocationLogoUploading(true);
    setLocationLogoMessage(null);
    try {
      const ext = locationLogoFile.name.split(".").pop() || "png";
      const path = `location-logos/${expandedId}/${locationLogoId}/${Date.now()}.${ext}`;
      const logoRef = storageRef(firebaseStorage, path);
      await uploadBytes(logoRef, locationLogoFile, {
        contentType: locationLogoFile.type || "image/png",
      });
      const logoUrl = await getDownloadURL(logoRef);
      await updateDoc(
        doc(firestore, "businesses", expandedId, "locations", locationLogoId),
        {
          logoPath: path,
          logoUrl,
          updatedAt: serverTimestamp(),
        } satisfies Partial<LocationDoc>,
      );
      setLocationLogoFile(null);
      setLocationLogoMessage("Logo uploaded.");
      void load();
    } catch (err) {
      setLocationLogoMessage(err instanceof Error ? err.message : "Failed to upload logo.");
    } finally {
      setLocationLogoUploading(false);
    }
  }

  async function saveLocations(causeId: string) {
    if (!user || !expandedId) {
      setCauseMessage("Select a business first.");
      return;
    }
    const selected =
      causeAssignments[expandedId]?.find((c) => c.id === causeId)?.selectedLocationIds ?? [];
    setCauseSavingId(causeId);
    setCauseMessage(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/business/${expandedId}/cause-links`, {
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
    if (!expandedId) return;
    setCauseAssignments((prev) => {
      const list = prev[expandedId] ?? [];
      return {
        ...prev,
        [expandedId]: list.map((c) =>
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
    if (!expandedId) return;
    const allIds = currentBusiness?.locations.map((l) => l.id) ?? [];
    setCauseAssignments((prev) => {
      const list = prev[expandedId] ?? [];
      return {
        ...prev,
        [expandedId]: list.map((c) =>
          c.id === causeId ? { ...c, linked: true, selectedLocationIds: allIds } : c,
        ),
      };
    });
  }

  async function removeLink(causeId: string) {
    if (!user || !expandedId) return;
    setCauseSavingId(causeId);
    setCauseMessage(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/business/${expandedId}/cause-links`, {
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
        const list = prev[expandedId] ?? [];
        return {
          ...prev,
          [expandedId]: list.map((c) =>
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


  /* ── Effects ── */

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!expandedId || causeAssignments[expandedId]) return;
    void fetchCauseLinks(expandedId);
  }, [causeAssignments, expandedId, fetchCauseLinks]);

  useEffect(() => {
    if (activeSubAction !== "uploadLocationLogo" || !currentBusiness) return;
    if (locationLogoId && currentBusiness.locations.some((l) => l.id === locationLogoId)) return;
    setLocationLogoId(currentBusiness.locations[0]?.id ?? "");
  }, [activeSubAction, currentBusiness, locationLogoId]);

  /* ── Handlers ── */

  function toggleExpand(bizId: string) {
      if (expandedId === bizId) {
        setExpandedId(null);
      } else {
        setExpandedId(bizId);
        setActiveSubAction(null);
        setCauseMessage(null);
        setLogoMessage(null);
        setLocationLogoMessage(null);
      }
    }

  /* ── Render ── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-zinc-400">Loading businesses&hellip;</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Admin</p>
        <h1 className="text-2xl font-bold tracking-tight text-white">Business Management</h1>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {stat.label}
            </div>
            <div className="mt-1 text-2xl font-bold text-white">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Search + New Business */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
            />
          </svg>
          <input
            className="h-10 w-full rounded-lg border border-white/10 bg-white/5 pl-10 pr-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
            placeholder="Search businesses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowNewForm(!showNewForm)}
          className={BTN_PRIMARY}
        >
          + New Business
        </button>
      </div>

      {/* Inline Create Form */}
      {showNewForm && (
        <form
          onSubmit={submitBusiness}
          className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-5"
        >
          <h3 className="mb-3 text-sm font-semibold text-emerald-300">Create New Business</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              className={INPUT_CLS}
              placeholder="Business name"
              value={bizName}
              onChange={(e) => setBizName(e.target.value)}
            />
            <input
              className={INPUT_CLS}
              placeholder="Description (optional)"
              value={bizDescription}
              onChange={(e) => setBizDescription(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className={`${INPUT_CLS} flex-1 font-mono`}
                placeholder="slug (auto)"
                value={bizSlug}
                onChange={(e) => setBizSlug(e.target.value)}
              />
              <button type="submit" className={BTN_PRIMARY} disabled={bizSubmitting}>
                {bizSubmitting ? "Creating\u2026" : "Create"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Business List */}
      {businesses.length === 0 ? (
        <div className="py-10 text-center text-sm text-zinc-500">
          No businesses yet. Click &quot;+ New Business&quot; to create one.
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-zinc-500">
          No businesses match &quot;{search}&quot;.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((biz) => {
            const isExpanded = expandedId === biz.id;
            const linkedCauses = (causeAssignments[biz.id] ?? []).filter((c) => c.linked);
            const bizDonationCombos = isExpanded
              ? donationCombos.filter((c) => c.business.id === biz.id)
              : [];

            return (
              <div
                key={biz.id}
                className={`rounded-xl border transition ${
                  isExpanded
                    ? "border-emerald-400/20 bg-white/[0.03]"
                    : "border-white/5 bg-white/[0.02] hover:border-white/10"
                }`}
              >
                {/* Row Header */}
                <button
                  type="button"
                  onClick={() => toggleExpand(biz.id)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left"
                >
                  {/* Avatar */}
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                      biz.data.logoUrl
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {biz.data.name.charAt(0)}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{biz.data.name}</span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          biz.data.active
                            ? "bg-emerald-400/15 text-emerald-300"
                            : "bg-red-500/15 text-red-300"
                        }`}
                      >
                        {biz.data.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-zinc-500">/{biz.data.slug}</div>
                  </div>

                  {/* Quick stats */}
                  <div className="hidden items-center gap-6 text-xs text-zinc-500 sm:flex">
                    <div className="text-center">
                      <div className="font-semibold text-zinc-300">{biz.locations.length}</div>
                      <div>locations</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-zinc-300">{linkedCauses.length}</div>
                      <div>causes</div>
                    </div>
                  </div>

                  {/* Chevron */}
                  <svg
                    className={`h-4 w-4 shrink-0 text-zinc-500 transition ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-white/5 px-5 py-4">
                    {/* ===== Overview Grid ===== */}
                    {!activeSubAction && (
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {/* Locations Card */}
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                              Locations
                            </h4>
                            <button
                              type="button"
                              onClick={() => setActiveSubAction("addLocation")}
                              className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                            >
                              + Add
                            </button>
                          </div>
                          {biz.locations.length === 0 ? (
                            <p className="py-4 text-center text-xs text-zinc-600">
                              No locations yet
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {biz.locations.map((loc) => (
                                <div
                                  key={loc.id}
                                  className="flex items-center justify-between rounded-md bg-white/[0.03] px-3 py-2"
                                >
                                  <span className="text-sm text-white">{loc.name ?? loc.id}</span>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setLocationLogoId(loc.id);
                                        setActiveSubAction("uploadLocationLogo");
                                      }}
                                      className="text-xs text-zinc-400 hover:text-white"
                                    >
                                      Logo
                                    </button>
                                    <Link
                                      href={`/biz/${biz.id}/locations/${loc.id}/print`}
                                      className="text-xs text-emerald-300 hover:text-emerald-200"
                                    >
                                      QR
                                    </Link>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Causes Card */}
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                              Linked Causes
                            </h4>
                            <button
                              type="button"
                              onClick={() => setActiveSubAction("causesFullView")}
                              className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                            >
                              + Assign
                            </button>
                          </div>
                          {linkedCauses.length === 0 ? (
                            <p className="py-4 text-center text-xs text-zinc-600">
                              No causes linked
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {linkedCauses.map((cause) => (
                                <div
                                  key={cause.id}
                                  className="flex items-center justify-between rounded-md bg-white/[0.03] px-3 py-2"
                                >
                                  <span className="text-sm text-white">
                                    {cause.title ?? cause.id}
                                  </span>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setActiveSubAction("causesFullView")}
                                      className="text-xs text-emerald-300 hover:text-emerald-200"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeLink(cause.id)}
                                      disabled={causeSavingId === cause.id}
                                      className="text-xs text-red-400 hover:text-red-300"
                                    >
                                      {causeSavingId === cause.id ? "\u2026" : "Remove"}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {causeMessage && (
                            <div className="mt-2 text-xs text-zinc-400">{causeMessage}</div>
                          )}
                        </div>

                        {/* Quick Actions Card */}
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                            Quick Actions
                          </h4>
                          <div className="grid grid-cols-2 gap-2">
                            <Link
                              href={`/biz/${biz.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex flex-col items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-3 text-xs text-zinc-300 transition hover:border-white/15 hover:text-white"
                            >
                              <svg
                                className="h-5 w-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={1.5}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M15 10l4.553-4.553a1 1 0 011.414 1.414L16.414 11.45M14 6h-5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-5"
                                />
                              </svg>
                              Open console
                            </Link>
                            <button
                              type="button"
                              onClick={() => setActiveSubAction("uploadLogo")}
                              className="flex flex-col items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-3 text-xs text-zinc-300 transition hover:border-white/15 hover:text-white"
                            >
                              <svg
                                className="h-5 w-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={1.5}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                                />
                              </svg>
                              Upload Logo
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveSubAction("qrLinks")}
                              className="flex flex-col items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-3 text-xs text-zinc-300 transition hover:border-white/15 hover:text-white"
                            >
                              <svg
                                className="h-5 w-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={1.5}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5z"
                                />
                              </svg>
                              Print QR
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveSubAction("donationUrls")}
                              className="flex flex-col items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-3 text-xs text-zinc-300 transition hover:border-white/15 hover:text-white"
                            >
                              <svg
                                className="h-5 w-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={1.5}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.193-5.188a4.5 4.5 0 00-6.364-6.364L3.75 6.38a4.5 4.5 0 006.364 6.364l4.5-4.5z"
                                />
                              </svg>
                              Support URLs
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ===== Sub-action: Add Location ===== */}
                    {activeSubAction === "addLocation" && (
                      <div>
                        <div className="mb-4 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setActiveSubAction(null)}
                            className="text-xs text-zinc-400 hover:text-white"
                          >
                            &larr; Back
                          </button>
                          <h3 className="text-sm font-semibold text-white">Add Location</h3>
                        </div>
                        <form onSubmit={submitLocation} className="grid gap-3 sm:grid-cols-3">
                          <input
                            className={INPUT_CLS}
                            placeholder="Location name"
                            value={locName}
                            onChange={(e) => setLocName(e.target.value)}
                          />
                          <input
                            className={`${INPUT_CLS} font-mono`}
                            placeholder="Slug (auto)"
                            value={locSlug}
                            onChange={(e) => setLocSlug(e.target.value)}
                          />
                          <button type="submit" className={BTN_PRIMARY} disabled={locSubmitting}>
                            {locSubmitting ? "Saving\u2026" : "Add Location"}
                          </button>
                        </form>
                      </div>
                    )}

                    {/* ===== Sub-action: Cause Assignment ===== */}
                    {activeSubAction === "causesFullView" && (
                      <div>
                        <div className="mb-4 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setActiveSubAction(null)}
                            className="text-xs text-zinc-400 hover:text-white"
                          >
                            &larr; Back
                          </button>
                          <h3 className="text-sm font-semibold text-white">Cause Assignment</h3>
                        </div>
                        {causeLoadingId === expandedId ? (
                          <div className="text-sm text-zinc-400">Loading causes&hellip;</div>
                        ) : (causeAssignments[biz.id] ?? []).length === 0 ? (
                          <div className="text-sm text-zinc-400">
                            No causes available yet. Add causes in the Causes section first.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {(causeAssignments[biz.id] ?? []).map((cause) => (
                              <div
                                key={cause.id}
                                className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-white">
                                      {cause.title ?? cause.id}
                                    </div>
                                    {cause.description && (
                                      <div className="text-xs text-zinc-400">
                                        {cause.description}
                                      </div>
                                    )}
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
                                      {causeSavingId === cause.id ? "Saving\u2026" : "Save"}
                                    </button>
                                    {cause.linked && (
                                      <button
                                        type="button"
                                        className="text-xs font-semibold text-red-300 underline underline-offset-2 hover:text-red-200"
                                        onClick={() => removeLink(cause.id)}
                                        disabled={causeSavingId === cause.id}
                                      >
                                        Remove
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="mt-2 text-xs uppercase tracking-wide text-zinc-500">
                                  Locations {cause.linked ? "(enabled)" : "(not added yet)"}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {currentBusiness?.locations.map((loc) => {
                                    const checked = cause.selectedLocationIds?.includes(loc.id);
                                    return (
                                      <label
                                        key={loc.id}
                                        className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                                          checked
                                            ? "border-emerald-300 bg-emerald-300 text-emerald-950 shadow-lg shadow-emerald-400/30"
                                            : "border-white/15 bg-white/5 text-white hover:border-white/25"
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          className="hidden"
                                          checked={!!checked}
                                          onChange={() => toggleLocation(cause.id, loc.id)}
                                        />
                                        {loc.name}
                                      </label>
                                    );
                                  })}
                                </div>
                                <div className="mt-2 text-xs text-zinc-500">
                                  Save to generate support URLs. Use &quot;Remove&quot; to detach
                                  this charity.
                                </div>
                              </div>
                            ))}
                            {causeMessage && (
                              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200">
                                {causeMessage}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ===== Sub-action: Upload Business Logo ===== */}
                    {activeSubAction === "uploadLogo" && (
                      <div>
                        <div className="mb-4 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setActiveSubAction(null)}
                            className="text-xs text-zinc-400 hover:text-white"
                          >
                            &larr; Back
                          </button>
                          <h3 className="text-sm font-semibold text-white">Upload Business Logo</h3>
                        </div>
                        <form onSubmit={submitLogo} className="space-y-3">
                          <div className="text-xs text-zinc-400">
                            {currentBusiness?.data.logoUrl
                              ? "Current logo on file."
                              : "No logo uploaded yet."}
                          </div>
                          <label className="block text-sm text-zinc-200">
                            <div className="mb-1 font-semibold text-white">Logo image</div>
                            <input
                              type="file"
                              accept="image/*"
                              className="block w-full text-xs text-zinc-200 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                            />
                          </label>
                          {logoMessage && (
                            <div className="text-xs text-zinc-300">{logoMessage}</div>
                          )}
                          <button type="submit" className={BTN_PRIMARY} disabled={logoUploading}>
                            {logoUploading ? "Uploading\u2026" : "Upload Logo"}
                          </button>
                        </form>
                      </div>
                    )}

                    {/* ===== Sub-action: Upload Location Logo ===== */}
                    {activeSubAction === "uploadLocationLogo" && (
                      <div>
                        <div className="mb-4 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setActiveSubAction(null)}
                            className="text-xs text-zinc-400 hover:text-white"
                          >
                            &larr; Back
                          </button>
                          <h3 className="text-sm font-semibold text-white">
                            Upload Location Logo
                          </h3>
                        </div>
                        <form onSubmit={submitLocationLogo} className="space-y-3">
                          <label className="block text-sm text-zinc-200">
                            <div className="mb-1 font-semibold text-white">Location</div>
                            <select
                              className={INPUT_CLS}
                              value={locationLogoId}
                              onChange={(e) => setLocationLogoId(e.target.value)}
                            >
                              <option value="">Select&hellip;</option>
                              {(currentBusiness?.locations ?? []).map((loc) => (
                                <option key={loc.id} value={loc.id}>
                                  {loc.name ?? loc.id}
                                </option>
                              ))}
                            </select>
                          </label>
                          {locationLogoId && (
                            <div className="text-xs text-zinc-400">
                              {currentBusiness?.locations.find((l) => l.id === locationLogoId)
                                ?.logoUrl
                                ? "Logo on file."
                                : "No logo uploaded yet."}
                            </div>
                          )}
                          <label className="block text-sm text-zinc-200">
                            <div className="mb-1 font-semibold text-white">Logo image</div>
                            <input
                              type="file"
                              accept="image/*"
                              className="block w-full text-xs text-zinc-200 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                              onChange={(e) =>
                                setLocationLogoFile(e.target.files?.[0] ?? null)
                              }
                            />
                          </label>
                          {locationLogoMessage && (
                            <div className="text-xs text-zinc-300">{locationLogoMessage}</div>
                          )}
                          <button
                            type="submit"
                            className={BTN_PRIMARY}
                            disabled={locationLogoUploading || !locationLogoId}
                          >
                            {locationLogoUploading ? "Uploading\u2026" : "Upload Logo"}
                          </button>
                        </form>
                      </div>
                    )}

                    {/* ===== Sub-action: Support URLs ===== */}
                    {activeSubAction === "donationUrls" && (
                      <div>
                        <div className="mb-4 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setActiveSubAction(null)}
                            className="text-xs text-zinc-400 hover:text-white"
                          >
                            &larr; Back
                          </button>
                          <h3 className="text-sm font-semibold text-white">Support URLs</h3>
                        </div>
                        {bizDonationCombos.length === 0 ? (
                          <div className="text-sm text-zinc-500">
                            No support URLs yet. Assign causes to locations first.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {bizDonationCombos.map((combo) => (
                              <div
                                key={`${combo.cause.id}-${combo.location.id}`}
                                className="rounded-lg bg-white/[0.03] px-3 py-2"
                              >
                                <div className="text-xs uppercase tracking-wide text-zinc-500">
                                  {combo.location.name} &middot; {combo.cause.title}
                                </div>
                                <div className="mt-0.5 font-mono text-xs text-zinc-300">
                                  {combo.url}
                                </div>
                                <div className="text-xs text-zinc-500">
                                  QR tokens required. Use QR print pages for secure links.
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ===== Sub-action: QR Links ===== */}
                    {activeSubAction === "qrLinks" && (
                      <div>
                        <div className="mb-4 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setActiveSubAction(null)}
                            className="text-xs text-zinc-400 hover:text-white"
                          >
                            &larr; Back
                          </button>
                          <h3 className="text-sm font-semibold text-white">Print QR Sheets</h3>
                        </div>
                        {biz.locations.length === 0 ? (
                          <div className="text-sm text-zinc-500">No locations yet.</div>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {biz.locations.map((loc) => (
                              <div
                                key={loc.id}
                                className="flex items-center justify-between rounded-md bg-white/[0.03] px-3 py-2"
                              >
                                <div>
                                  <div className="text-sm font-semibold text-white">
                                    {loc.name ?? loc.id}
                                  </div>
                                  <div className="text-xs text-zinc-500">{loc.id}</div>
                                </div>
                                <Link
                                  href={`/biz/${biz.id}/locations/${loc.id}/print`}
                                  className="text-xs font-semibold text-emerald-300 underline hover:text-emerald-200"
                                >
                                  Print sheet
                                </Link>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Link
        className="text-sm font-semibold text-emerald-300 underline hover:text-emerald-200"
        href="/admin"
      >
        &larr; Back to admin overview
      </Link>
    </div>
  );
}
