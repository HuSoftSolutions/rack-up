"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { CauseDoc } from "@/lib/types/business";

type CauseRow = (CauseDoc & { id: string }) & {
  remoteUrl?: string;
  businessLinks?: {
    businessId: string;
    businessName: string;
    businessSlug: string;
    locations: { id: string; slug: string; name?: string; qrToken?: string }[];
  }[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

type QRItem = {
  id: string;
  businessName: string;
  locationName: string;
  type: "location" | "remote";
  url: string;
  imageDataUrl?: string;
};

type QRTab = "all" | "location" | "remote";

export default function AdminCauseDetailPage() {
  const params = useParams<{ causeId: string }>();
  const { user } = useAuth();
  const [cause, setCause] = useState<CauseRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrItems, setQrItems] = useState<QRItem[]>([]);
  const [activeTab, setActiveTab] = useState<QRTab>("all");

  const remoteConfig = cause?.pointsConfig?.remote;
  const remoteMode = remoteConfig?.mode ?? cause?.mode;
  const remoteOptions =
    remoteConfig?.predefinedOptions ?? (remoteConfig ? [] : cause?.predefinedOptions ?? []);
  const remotePointsPerDollar =
    typeof remoteConfig?.pointsPerDollar === "number"
      ? remoteConfig.pointsPerDollar
      : remoteConfig
        ? undefined
        : cause?.pointsPerDollar;

  const locationCount = useMemo(
    () => cause?.businessLinks?.reduce((sum, link) => sum + (link.locations?.length ?? 0), 0) ?? 0,
    [cause],
  );

  const filteredQrItems = useMemo(() => {
    if (activeTab === "all") return qrItems;
    return qrItems.filter((item) => item.type === activeTab);
  }, [qrItems, activeTab]);

  const locationQrCount = useMemo(() => qrItems.filter((i) => i.type === "location").length, [qrItems]);
  const remoteQrCount = useMemo(() => qrItems.filter((i) => i.type === "remote").length, [qrItems]);

  useEffect(() => {
    if (!user) return;
    const currentUser = user;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch("/api/admin/causes", { headers: { Authorization: `Bearer ${idToken}` } });
        const json = (await res.json()) as { causes?: CauseRow[]; error?: string };
        if (!res.ok || !json.causes) throw new Error(json.error ?? "Failed to load cause.");
        const found = json.causes.find((c) => c.id === params.causeId);
        if (!found) throw new Error("Cause not found.");
        setCause(found);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load cause.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [params.causeId, user]);

  useEffect(() => {
    async function generate() {
      if (!cause) return;
      const combos: QRItem[] = [];

      cause.businessLinks?.forEach((link) => {
        link.locations.forEach((loc) => {
          const baseUrl = `/donate/${link.businessSlug}/${cause.id}/${loc.slug}`;
          const url = loc.qrToken ? `${baseUrl}?qr=${encodeURIComponent(loc.qrToken)}` : baseUrl;
          combos.push({
            id: `${link.businessId}-${cause.id}-${loc.id}`,
            businessName: link.businessName,
            locationName: loc.name ?? loc.id,
            type: "location",
            url,
          });
        });
      });

      if (cause.remoteUrl) {
        combos.push({
          id: `${cause.id}-remote`,
          businessName: "Remote",
          locationName: "All locations",
          type: "remote",
          url: cause.remoteUrl,
        });
      }

      if (typeof window === "undefined") {
        setQrItems(combos);
        return;
      }

      const withQr: QRItem[] = [];
      const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin).replace(/\/$/, "");
      for (const combo of combos) {
        try {
          const dataUrl = await QRCode.toDataURL(origin + combo.url, {
            margin: 1,
            width: 240,
          });
          withQr.push({ ...combo, imageDataUrl: dataUrl });
        } catch {
          withQr.push(combo);
        }
      }
      setQrItems(withQr);
    }
    void generate();
  }, [cause]);

  return (
    <div className="text-white">
      {/* Header */}
      <div className="mb-6">
        <Link href="/admin/causes" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-white">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to causes
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">{cause?.title ?? "Cause details"}</h1>
              {cause ? (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    cause.active === false ? "bg-red-500/15 text-red-300" : "bg-emerald-400/15 text-emerald-300"
                  }`}
                >
                  <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${cause.active === false ? "bg-red-400" : "bg-emerald-400"}`} />
                  {cause.active === false ? "Inactive" : "Active"}
                </span>
              ) : null}
            </div>
            {cause?.description ? (
              <p className="mt-1 max-w-2xl text-sm text-zinc-400">{cause.description}</p>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading cause details...
        </div>
      ) : !cause ? (
        <div className="text-sm text-zinc-400">Cause not found.</div>
      ) : (
        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className="w-72 shrink-0">
            <div className="sticky top-6 space-y-4">
              {/* Image Card */}
              {cause.imageUrl ? (
                <div className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.02]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cause.imageUrl} alt={cause.title} className="aspect-video w-full object-cover" />
                </div>
              ) : null}

              {/* Details Card */}
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">In-person points</h3>
                <dl className="mt-3 space-y-3">
                  <div>
                    <dt className="text-xs text-zinc-500">Mode</dt>
                    <dd className="mt-0.5 text-sm font-medium capitalize text-white">{cause.mode}</dd>
                  </div>
                  {cause.mode === "predefined" ? (
                    <div>
                      <dt className="text-xs text-zinc-500">Options</dt>
                      <dd className="mt-1 space-y-1">
                        {(cause.predefinedOptions ?? []).map((opt) => (
                          <div key={`${opt.amountCents}-${opt.points}-${opt.label ?? "opt"}`} className="flex items-center justify-between rounded-md bg-white/5 px-2 py-1 text-xs">
                            <span className="text-zinc-300">${((opt.amountCents ?? 0) / 100).toFixed(0)}</span>
                            <span className="font-medium text-emerald-300">{opt.points} pts</span>
                          </div>
                        ))}
                        {(cause.predefinedOptions ?? []).length === 0 ? (
                          <div className="text-xs text-zinc-500">No options configured</div>
                        ) : null}
                      </dd>
                    </div>
                  ) : (
                    <>
                      <div>
                        <dt className="text-xs text-zinc-500">Points per dollar</dt>
                        <dd className="mt-0.5 text-sm font-medium text-white">{cause.pointsPerDollar ?? "—"}</dd>
                      </div>
                      <div className="flex gap-4">
                        <div>
                          <dt className="text-xs text-zinc-500">Min</dt>
                          <dd className="mt-0.5 text-sm font-medium text-white">
                            {cause.minAmountCents ? `$${(cause.minAmountCents / 100).toFixed(0)}` : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-zinc-500">Max</dt>
                          <dd className="mt-0.5 text-sm font-medium text-white">
                            {cause.maxAmountCents ? `$${(cause.maxAmountCents / 100).toFixed(0)}` : "—"}
                          </dd>
                        </div>
                      </div>
                    </>
                  )}
                </dl>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Remote points</h3>
                <dl className="mt-3 space-y-3">
                  <div>
                    <dt className="text-xs text-zinc-500">Mode</dt>
                    <dd className="mt-0.5 text-sm font-medium capitalize text-white">
                      {remoteMode ?? "—"}
                    </dd>
                  </div>
                  {remoteMode === "predefined" ? (
                    <div>
                      <dt className="text-xs text-zinc-500">Options</dt>
                      <dd className="mt-1 space-y-1">
                        {(remoteOptions ?? []).map((opt) => (
                          <div key={`${opt.amountCents}-${opt.points}-${opt.label ?? "opt"}`} className="flex items-center justify-between rounded-md bg-white/5 px-2 py-1 text-xs">
                            <span className="text-zinc-300">${((opt.amountCents ?? 0) / 100).toFixed(0)}</span>
                            <span className="font-medium text-purple-300">{opt.points} pts</span>
                          </div>
                        ))}
                        {(remoteOptions ?? []).length === 0 ? (
                          <div className="text-xs text-zinc-500">No options configured</div>
                        ) : null}
                      </dd>
                    </div>
                  ) : (
                    <>
                      <div>
                        <dt className="text-xs text-zinc-500">Points per dollar</dt>
                        <dd className="mt-0.5 text-sm font-medium text-white">
                          {typeof remotePointsPerDollar === "number" ? remotePointsPerDollar : "—"}
                        </dd>
                      </div>
                      <div className="flex gap-4">
                        <div>
                          <dt className="text-xs text-zinc-500">Min</dt>
                          <dd className="mt-0.5 text-sm font-medium text-white">
                            {cause.minAmountCents ? `$${(cause.minAmountCents / 100).toFixed(0)}` : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-zinc-500">Max</dt>
                          <dd className="mt-0.5 text-sm font-medium text-white">
                            {cause.maxAmountCents ? `$${(cause.maxAmountCents / 100).toFixed(0)}` : "—"}
                          </dd>
                        </div>
                      </div>
                    </>
                  )}
                </dl>
              </div>

              {/* Stats Card */}
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Coverage</h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-white/5 p-3 text-center">
                    <div className="text-xl font-bold text-white">{cause.businessLinks?.length ?? 0}</div>
                    <div className="text-xs text-zinc-500">Businesses</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3 text-center">
                    <div className="text-xl font-bold text-white">{locationCount}</div>
                    <div className="text-xs text-zinc-500">Locations</div>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="min-w-0 flex-1">
            <div className="rounded-xl border border-white/5 bg-white/[0.02]">
              {/* Tab Header */}
              <div className="flex items-center justify-between border-b border-white/5 px-4">
                <div className="flex">
                  <button
                    onClick={() => setActiveTab("all")}
                    className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                      activeTab === "all" ? "text-white" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    All QR Codes
                    <span className="ml-2 rounded-full bg-white/10 px-1.5 py-0.5 text-xs">{qrItems.length}</span>
                    {activeTab === "all" && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-emerald-400" />}
                  </button>
                  <button
                    onClick={() => setActiveTab("location")}
                    className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                      activeTab === "location" ? "text-white" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Location
                    <span className="ml-2 rounded-full bg-white/10 px-1.5 py-0.5 text-xs">{locationQrCount}</span>
                    {activeTab === "location" && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-emerald-400" />}
                  </button>
                  <button
                    onClick={() => setActiveTab("remote")}
                    className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                      activeTab === "remote" ? "text-white" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Remote
                    <span className="ml-2 rounded-full bg-white/10 px-1.5 py-0.5 text-xs">{remoteQrCount}</span>
                    {activeTab === "remote" && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-emerald-400" />}
                  </button>
                </div>
              </div>

              {/* QR Grid */}
              <div className="p-4">
                {filteredQrItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="rounded-full bg-white/5 p-3">
                      <svg className="h-6 w-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
                      </svg>
                    </div>
                    <p className="mt-3 text-sm text-zinc-400">
                      {activeTab === "all"
                        ? "No QR codes available. Link this cause to business locations first."
                        : activeTab === "location"
                          ? "No location-based QR codes available."
                          : "No remote QR codes available."}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredQrItems.map((item) => (
                      <div
                        key={item.id}
                        className="group flex flex-col rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-white/10 hover:bg-white/[0.04]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-white">{item.businessName}</div>
                            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                              <span className={`h-1.5 w-1.5 rounded-full ${item.type === "remote" ? "bg-purple-400" : "bg-blue-400"}`} />
                              {item.locationName}
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
                            item.type === "remote" ? "bg-purple-500/15 text-purple-300" : "bg-blue-500/15 text-blue-300"
                          }`}>
                            {item.type === "remote" ? "Remote" : "Location"}
                          </span>
                        </div>

                        <div className="mt-3 flex justify-center">
                          {item.imageDataUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.imageDataUrl}
                              alt="QR code"
                              className="h-36 w-36 rounded-lg border border-white/10 bg-white p-2"
                            />
                          ) : (
                            <div className="flex h-36 w-36 items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/5">
                              <svg className="h-5 w-5 animate-spin text-zinc-500" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            </div>
                          )}
                        </div>

                        <div className="mt-3 truncate rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-400 font-mono">
                          {item.url}
                        </div>

                        {item.imageDataUrl ? (
                          <a
                            href={item.imageDataUrl}
                            download={`${item.businessName}-${item.locationName}-qr.png`}
                            className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/10"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download PNG
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
