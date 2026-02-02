"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { CauseDoc } from "@/lib/types/business";

type CauseRow = (CauseDoc & { id: string }) & {
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
  url: string;
  imageDataUrl?: string;
};

export default function AdminCauseDetailPage() {
  const params = useParams<{ causeId: string }>();
  const { user } = useAuth();
  const [cause, setCause] = useState<CauseRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrItems, setQrItems] = useState<QRItem[]>([]);

  const locationCount = useMemo(
    () => cause?.businessLinks?.reduce((sum, link) => sum + (link.locations?.length ?? 0), 0) ?? 0,
    [cause],
  );

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
            url,
          });
        });
      });

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
    <div className="space-y-6 text-white">
      <div>
        <Link href="/admin/causes" className="text-xs font-semibold text-emerald-300 underline underline-offset-2 hover:text-emerald-200">
          ← Back to causes
        </Link>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Admin</p>
            <h1 className="text-2xl font-bold tracking-tight text-white">{cause?.title ?? "Cause details"}</h1>
          </div>
          {cause ? (
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                cause.active === false ? "bg-red-500/15 text-red-300" : "bg-emerald-400/15 text-emerald-300"
              }`}
            >
              {cause.active === false ? "Inactive" : "Active"}
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
      ) : null}

      {loading ? (
        <div className="text-sm text-zinc-300">Loading…</div>
      ) : !cause ? (
        <div className="text-sm text-zinc-300">Cause not found.</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Description</div>
              <div className="mt-1 text-sm text-white">{cause.description || "—"}</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Mode</div>
              <div className="mt-1 font-semibold capitalize text-white">{cause.mode}</div>
              {cause.mode === "predefined" ? (
                <div className="mt-2 space-y-1 text-xs text-zinc-300">
                  {(cause.predefinedOptions ?? []).map((opt) => (
                    <div key={`${opt.amountCents}-${opt.points}-${opt.label ?? "opt"}`}>
                      {opt.label ?? `$${((opt.amountCents ?? 0) / 100).toFixed(2)} → ${opt.points} pts`}
                    </div>
                  ))}
                  {(cause.predefinedOptions ?? []).length === 0 ? (
                    <div className="text-zinc-500">No predefined amounts.</div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-2 space-y-1 text-xs text-zinc-300">
                  <div>{cause.pointsPerDollar ? `${cause.pointsPerDollar} pts per $` : "Custom entry"}</div>
                  <div>
                    Min:{" "}
                    {cause.minAmountCents ? `$${(cause.minAmountCents / 100).toFixed(2)}` : "—"} · Max:{" "}
                    {cause.maxAmountCents ? `$${(cause.maxAmountCents / 100).toFixed(2)}` : "—"}
                  </div>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Linked businesses</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {cause.businessLinks?.length ?? 0} businesses · {locationCount} locations
              </div>
              <div className="text-xs text-zinc-500">Locations determine available donation URLs.</div>
            </div>
          </div>

          {cause.imageUrl ? (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Image</div>
              <div className="mt-3 overflow-hidden rounded-xl border border-white/5 bg-white/[0.02]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cause.imageUrl} alt={cause.title} className="h-64 w-full object-contain bg-black" />
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Placement & QR codes</div>
                <div className="text-xs text-zinc-500">
                  {cause.businessLinks?.length ?? 0} businesses · {locationCount} locations
                </div>
              </div>
            </div>

            {qrItems.length === 0 ? (
              <div className="mt-3 text-sm text-zinc-300">This cause is not linked to any business locations yet.</div>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {qrItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-4"
                  >
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      {item.businessName} · {item.locationName}
                    </div>
                    <div className="break-words text-xs text-zinc-300">{item.url}</div>
                    <div className="flex flex-col items-center gap-2">
                      {item.imageDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageDataUrl}
                          alt="QR code"
                          className="h-44 w-44 rounded-lg border border-white/10 bg-white p-2"
                        />
                      ) : (
                        <div className="flex h-44 w-44 items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/5 text-xs text-zinc-300">
                          Generating QR…
                        </div>
                      )}
                      {item.imageDataUrl ? (
                        <a
                          href={item.imageDataUrl}
                          download={`${item.businessName}-${item.locationName}-qr.png`}
                          className="text-xs font-semibold text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
                        >
                          Download PNG
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
