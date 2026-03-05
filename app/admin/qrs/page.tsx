"use client";

import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useAuth } from "@/lib/auth/AuthProvider";

type BusinessEntity = {
  id: string;
  name: string;
  slug: string;
  locations: { id: string; name: string; slug: string; donationUrl?: string }[];
};

type CauseRow = {
  id: string;
  title?: string;
  remoteUrl?: string;
  businessLinks?: {
    businessId: string;
    businessName: string;
    businessSlug: string;
    remoteUrl?: string;
    locations: { id: string; slug: string; name?: string; qrToken?: string }[];
  }[];
};

type QrItem = {
  id: string;
  label: string;
  sublabel?: string;
  url: string;
  kind: "remote" | "location";
  imageDataUrl?: string;
  printUrl?: string;
  businessId?: string;
  causeId?: string;
  locationId?: string;
};

export default function AdminQrPage() {
  const { user } = useAuth();
  const [entities, setEntities] = useState<BusinessEntity[]>([]);
  const [causes, setCauses] = useState<CauseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "location" | "remote">("all");
  const [qrItems, setQrItems] = useState<QrItem[]>([]);
  const [businessFilter, setBusinessFilter] = useState<string>("__all__");
  const [causeFilter, setCauseFilter] = useState<string>("__all__");
  const [locationFilter, setLocationFilter] = useState<string>("__all__");
  const [remoteLandingUrl, setRemoteLandingUrl] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const currentUser = user;
    let canceled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const idToken = await currentUser.getIdToken();
        const [entitiesRes, causesRes] = await Promise.all([
          fetch("/api/admin/entities", { headers: { Authorization: `Bearer ${idToken}` } }),
          fetch("/api/admin/causes", { headers: { Authorization: `Bearer ${idToken}` } }),
        ]);
        const entitiesJson = (await entitiesRes.json()) as {
          businesses?: BusinessEntity[];
          remoteLandingUrl?: string;
          error?: string;
        };
        const causesJson = (await causesRes.json()) as { causes?: CauseRow[]; error?: string };
        if (!entitiesRes.ok || !entitiesJson.businesses) {
          throw new Error(entitiesJson.error ?? "Failed to load businesses.");
        }
        if (!causesRes.ok || !causesJson.causes) {
          throw new Error(causesJson.error ?? "Failed to load causes.");
        }
        if (!canceled) {
          setEntities(entitiesJson.businesses);
          setCauses(causesJson.causes);
          setRemoteLandingUrl(entitiesJson.remoteLandingUrl ?? null);
        }
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : "Failed to load QR codes.");
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [user]);

  const allItems = useMemo(() => {
    const locationItems: QrItem[] = [];
    entities.forEach((biz) => {
      biz.locations.forEach((loc) => {
        if (!loc.donationUrl) return;
        locationItems.push({
          id: `location-${biz.id}-${loc.id}`,
          label: `${biz.name} · ${loc.name}`,
          sublabel: "Location landing",
          url: loc.donationUrl,
          kind: "location",
          printUrl: `/biz/${biz.id}/locations/${loc.id}/print/landing`,
          businessId: biz.id,
          locationId: loc.id,
        });
      });
    });

    causes.forEach((cause) => {
      cause.businessLinks?.forEach((link) => {
        link.locations.forEach((loc) => {
          if (!loc.qrToken) return;
          const baseUrl = `/donate/${link.businessSlug}/${cause.id}/${loc.slug}`;
          const url = `${baseUrl}?qr=${encodeURIComponent(loc.qrToken)}`;
          locationItems.push({
            id: `cause-${link.businessId}-${loc.id}-${cause.id}`,
            label: `${link.businessName} · ${loc.name ?? loc.id}`,
            sublabel: cause.title ?? cause.id,
            url,
            kind: "location",
            printUrl: `/biz/${link.businessId}/locations/${loc.id}/print/${cause.id}`,
            businessId: link.businessId,
            causeId: cause.id,
            locationId: loc.id,
          });
        });
      });
    });

    const remoteItems: QrItem[] = [];
    if (remoteLandingUrl) {
      remoteItems.push({
        id: "remote-landing",
        label: "Remote landing",
        sublabel: "All charities",
        url: remoteLandingUrl,
        kind: "remote",
        printUrl: "/admin/qrs/remote",
      });
    }
    causes.forEach((cause) => {
      if (!cause.remoteUrl) return;
      remoteItems.push({
        id: `remote-${cause.id}`,
        label: cause.title ?? cause.id,
        sublabel: "Remote · Single charity",
        url: cause.remoteUrl,
        kind: "remote",
        printUrl: `/admin/qrs/remote/${cause.id}`,
        causeId: cause.id,
      });
    });

    return { locationItems, remoteItems };
  }, [causes, entities, remoteLandingUrl]);

  useEffect(() => {
    const items =
      tab === "location"
        ? allItems.locationItems
        : tab === "remote"
          ? allItems.remoteItems
          : [...allItems.locationItems, ...allItems.remoteItems];
    const filtered = items.filter((item) => {
      if (businessFilter !== "__all__" && item.businessId !== businessFilter) return false;
      if (causeFilter !== "__all__" && item.causeId !== causeFilter) return false;
      if (locationFilter !== "__all__" && item.locationId !== locationFilter) return false;
      return true;
    });
    if (filtered.length === 0) {
      setQrItems([]);
      return;
    }
    let canceled = false;
    async function generate() {
      const origin =
        typeof window !== "undefined"
          ? (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin).replace(/\/$/, "")
          : "";
      const next: QrItem[] = [];
      for (const item of filtered) {
        try {
          const data = await QRCode.toDataURL(origin + item.url, { margin: 1, width: 220 });
          next.push({ ...item, imageDataUrl: data });
        } catch {
          next.push(item);
        }
      }
      if (!canceled) setQrItems(next);
    }
    void generate();
    return () => {
      canceled = true;
    };
  }, [allItems.locationItems, allItems.remoteItems, tab, businessFilter, causeFilter, locationFilter]);

  const counts = {
    all: allItems.locationItems.length + allItems.remoteItems.length,
    location: allItems.locationItems.length,
    remote: allItems.remoteItems.length,
  };

  const causeOptions = useMemo(
    () =>
      [...causes].sort((a, b) => (a.title ?? a.id).localeCompare(b.title ?? b.id)),
    [causes],
  );

  const selectedBusiness = useMemo(
    () => entities.find((biz) => biz.id === businessFilter) ?? null,
    [businessFilter, entities],
  );

  const locationOptions = selectedBusiness?.locations ?? [];

  useEffect(() => {
    if (businessFilter === "__all__") {
      setLocationFilter("__all__");
      return;
    }
    if (locationFilter !== "__all__" && !locationOptions.some((loc) => loc.id === locationFilter)) {
      setLocationFilter("__all__");
    }
  }, [businessFilter, locationFilter, locationOptions]);

  return (
    <div className="space-y-6 text-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Admin</p>
        <h1 className="text-2xl font-bold tracking-tight text-white">QR Codes</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Remote QRs are admin-only. Location QRs are for in-person use.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {([
          { key: "all", label: "All QR Codes", count: counts.all },
          { key: "location", label: "Location", count: counts.location },
          { key: "remote", label: "Remote", count: counts.remote },
        ] as const).map((item) => (
          <button
            key={item.key}
            type="button"
            className={`rounded-full border px-4 py-2 text-sm ${
              tab === item.key ? "border-emerald-400 bg-emerald-500/15 text-white" : "border-white/10 text-zinc-300"
            }`}
            onClick={() => setTab(item.key)}
          >
            {item.label} <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs">{item.count}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Business filter
        </label>
        <select
          className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white"
          value={businessFilter}
          onChange={(e) => setBusinessFilter(e.target.value)}
        >
          <option value="__all__">All businesses</option>
          {entities.map((biz) => (
            <option key={biz.id} value={biz.id}>
              {biz.name}
            </option>
          ))}
        </select>
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Location filter
        </label>
        <select
          className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white disabled:opacity-50"
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          disabled={businessFilter === "__all__"}
        >
          <option value="__all__">All locations</option>
          {locationOptions.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Charity filter
        </label>
        <select
          className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white"
          value={causeFilter}
          onChange={(e) => setCauseFilter(e.target.value)}
        >
          <option value="__all__">All charities</option>
          {causeOptions.map((cause) => (
            <option key={cause.id} value={cause.id}>
              {cause.title ?? cause.id}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-zinc-400">Loading QR codes…</div>
      ) : qrItems.length === 0 ? (
        <div className="text-sm text-zinc-400">No QR codes available.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {qrItems.map((item) => (
            <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">{item.label}</div>
                  {item.sublabel ? (
                    <div className="text-xs text-zinc-400">{item.sublabel}</div>
                  ) : null}
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    item.kind === "remote"
                      ? "bg-purple-500/20 text-purple-200"
                      : "bg-emerald-500/20 text-emerald-200"
                  }`}
                >
                  {item.kind === "remote" ? "Remote" : "Location"}
                </span>
              </div>
              <div className="mt-4 flex justify-center">
                {item.imageDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageDataUrl}
                    alt="QR code"
                    className="h-44 w-44 rounded-lg border border-white/10 bg-white p-2"
                  />
                ) : (
                  <div className="flex h-44 w-44 items-center justify-center rounded-lg border border-dashed border-white/20 text-xs text-zinc-400">
                    Generating…
                  </div>
                )}
              </div>
              <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300 break-words">
                {item.url}
              </div>
              {item.imageDataUrl ? (
                <a
                  href={item.imageDataUrl}
                  download={`${item.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.png`}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5"
                >
                  Download PNG
                </a>
              ) : null}
              <button
                type="button"
                className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5"
                onClick={async () => {
                  if (typeof window === "undefined") return;
                  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin).replace(/\/$/, "");
                  const value = `${origin}${item.url}`;
                  try {
                    await navigator.clipboard.writeText(value);
                  } catch {
                    const input = document.createElement("input");
                    input.value = value;
                    document.body.appendChild(input);
                    input.select();
                    document.execCommand("copy");
                    document.body.removeChild(input);
                  }
                  setCopiedId(item.id);
                  window.setTimeout(() => setCopiedId((current) => (current === item.id ? null : current)), 2000);
                }}
              >
                {copiedId === item.id ? "Copied!" : "Copy link"}
              </button>
              {item.printUrl ? (
                <a
                  href={item.printUrl}
                  className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5"
                  target="_blank"
                  rel="noreferrer"
                >
                  Printable sheet
                </a>
              ) : null}
              {item.printUrl ? (
                <button
                  type="button"
                  className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5"
                  onClick={() => {
                    if (typeof window === "undefined") return;
                    window.open(item.printUrl, "_blank", "noopener,noreferrer");
                  }}
                >
                  Print now
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
