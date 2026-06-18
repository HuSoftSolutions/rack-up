import Link from "next/link";
import Image from "next/image";
import { adminFirestore } from "@/lib/firebase/admin";
import PublicShell from "@/app/_components/PublicNav";
import { unstable_noStore as noStore } from "next/cache";
import type { ScanEventDoc, ScanEventLocation } from "@/lib/types/scan-event";
import ScanMap, { type MapSpot } from "./ScanMap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

type ScanSpot = {
  id: string;
  title: string;
  logoUrl: string | null;
  place: ScanEventLocation | null;
};

async function fetchScanSpots(): Promise<{ spots: ScanSpot[]; error?: string | null }> {
  noStore();
  try {
    const snap = await adminFirestore.collection("scan_events").where("active", "==", true).get();
    const spots = snap.docs
      .map((doc) => {
        const data = doc.data() as ScanEventDoc;
        return {
          id: doc.id,
          title: data.title ?? doc.id,
          logoUrl: data.imageUrl ?? null,
          place: data.place ?? null,
        } satisfies ScanSpot;
      })
      .sort((a, b) => a.title.localeCompare(b.title));
    return { spots, error: null };
  } catch (err) {
    console.error("Scan spots fetch failed:", err);
    return { spots: [], error: err instanceof Error ? err.message : "Failed to load locations." };
  }
}

function mapsUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default async function LocationsPage() {
  const { spots, error } = await fetchScanSpots();

  const mapSpots: MapSpot[] = spots
    .filter((s): s is ScanSpot & { place: ScanEventLocation } => Boolean(s.place))
    .map((s) => ({ id: s.id, title: s.title, address: s.place.address, lat: s.place.lat, lng: s.place.lng }));

  return (
    <PublicShell contentClassName="flex flex-col gap-0">
      {/* ── Header ── */}
      <header className="relative pb-8 pt-8 sm:pt-12">
        <div className="pointer-events-none absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-emerald-500/[0.07] blur-[120px]" />
        <div className="relative space-y-4 lg:max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
            Where to scan
          </span>
          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Find a place to scan &amp; support.
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-zinc-300 sm:text-lg">
            Every participating spot is listed below. Visit any of them, scan the QR code,
            and support a cause while earning points.
          </p>
          {spots.length > 0 ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-sm font-semibold text-emerald-200">
              {spots.length} place{spots.length === 1 ? "" : "s"} to scan
            </div>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="mb-8 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          Unable to load locations: {error}
        </div>
      ) : null}

      {/* ── Map ── */}
      {mapSpots.length > 0 ? (
        <div className="mb-10">
          <ScanMap spots={mapSpots} />
        </div>
      ) : null}

      {/* ── List ── */}
      {spots.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-zinc-300">
          Locations will appear here as scan spots come online.
        </div>
      ) : (
        <div className="grid gap-4 pb-16 sm:grid-cols-2 lg:grid-cols-3">
          {spots.map((spot) => {
            const address = spot.place?.address ?? "";
            const hasAddress = address.length > 0;
            return (
              <div
                key={spot.id}
                className="flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-emerald-300/40 hover:bg-white/[0.05]"
              >
                <div className="flex items-center gap-3">
                  {spot.logoUrl ? (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white p-1">
                      <Image
                        src={spot.logoUrl}
                        alt={`${spot.title} logo`}
                        width={96}
                        height={96}
                        className="h-full w-full object-contain"
                      />
                    </div>
                  ) : null}
                  <div className="text-lg font-semibold text-white">{spot.title}</div>
                </div>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-400">
                  {hasAddress ? address : "Location coming soon."}
                </p>
                {hasAddress ? (
                  <a
                    href={mapsUrl(address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex h-9 w-fit items-center justify-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-400/10 px-4 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
                  >
                    Get directions &rarr;
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* ── CTA ── */}
      <section className="mb-16 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Can&apos;t make it in person?</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
          You can still support participating causes remotely and earn points from home.
        </p>
        <Link
          href="/donate/remote"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-emerald-400 px-6 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300"
        >
          Support from home
        </Link>
      </section>
    </PublicShell>
  );
}
