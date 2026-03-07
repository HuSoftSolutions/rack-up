import Link from "next/link";
import LandingAuthActions from "@/app/_components/LandingAuthActions";
import LandingEligibilityCta from "@/app/_components/LandingEligibilityCta";
import GiveawayProgressCard from "@/app/_components/GiveawayProgressCard";
import LandingCommunityDrawings from "@/app/_components/LandingCommunityDrawings";
import { adminFirestore } from "@/lib/firebase/admin";
import { ClientOnly } from "@/app/_components/ClientOnly";
import PublicShell from "@/app/_components/PublicNav";
import FeaturedPartners, { type PartnerLogo } from "@/app/_components/FeaturedPartners";
import { unstable_noStore as noStore } from "next/cache";
import { resolvePointsConfig } from "@/lib/server/points-config";
import type { CauseDoc } from "@/lib/types/business";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

type LandingDonation = {
  id: string;
  amountCents: number | null;
  points: number | null;
  causeTitle: string | null;
  businessName: string | null;
  createdAt: string | null;
};

type LandingCause = {
  id: string;
  title?: string;
  description?: string;
  businessId?: string;
  mode: CauseDoc["mode"];
  pointsPerDollar?: number;
  predefinedOptions?: CauseDoc["predefinedOptions"];
  pointsConfig?: CauseDoc["pointsConfig"];
  minAmountCents?: number;
  maxAmountCents?: number;
  active?: boolean;
};

type LandingGiveaway = {
  id: string;
  title: string;
  description?: string;
  prize?: {
    name?: string;
    value?: string;
    imageUrl?: string;
    description?: string;
  } | null;
};

async function fetchLandingData(): Promise<{
  donations: LandingDonation[];
  causes: LandingCause[];
  giveaways: LandingGiveaway[];
  totalDonationCents: number;
  partners: PartnerLogo[];
  error?: string | null;
}> {
  noStore();
  try {
    const donationSnapPromise = adminFirestore
      .collection("donations")
      .where("status", "==", "completed")
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    const causeSnapPromise = adminFirestore
      .collection("causes")
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    const businessesSnapPromise = adminFirestore
      .collection("businesses")
      .where("active", "==", true)
      .get();

    const [donationSnap, causeSnap, businessesSnap, locationsSnap, giveawaysSnap] = await Promise.all([
      donationSnapPromise,
      causeSnapPromise,
      businessesSnapPromise,
      adminFirestore.collectionGroup("locations").get(),
      adminFirestore.collection("giveaways").where("status", "==", "active").limit(20).get(),
    ]);

    const donations = donationSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        amountCents: data.amountCents ?? null,
        points: data.points ?? null,
        causeTitle: data.causeTitle ?? null,
        businessName: data.businessName ?? null,
        createdAt:
          typeof data.createdAt?.toDate === "function"
            ? data.createdAt.toDate().toISOString()
            : null,
      } satisfies LandingDonation;
    });

    const totalDonationCents = donations.reduce(
      (sum, d) => sum + (typeof d.amountCents === "number" ? d.amountCents : 0),
      0,
    );

    const causes = causeSnap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title ?? doc.id,
          description: data.description ?? "",
          businessId: data.businessId ?? doc.ref.parent.parent?.id,
          mode: (data.mode as CauseDoc["mode"]) ?? "custom",
          pointsPerDollar: data.pointsPerDollar ?? null,
          predefinedOptions: data.predefinedOptions ?? [],
          pointsConfig: data.pointsConfig ?? undefined,
          minAmountCents: data.minAmountCents ?? null,
          maxAmountCents: data.maxAmountCents ?? null,
          active: data.active ?? true,
        } satisfies LandingCause & { active?: boolean };
      })
      .filter((cause) => cause.active)
      .slice(0, 8);

    const giveaways = giveawaysSnap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const prizeRaw =
          data.prize && typeof data.prize === "object"
            ? (data.prize as Record<string, unknown>)
            : null;
        const prize = prizeRaw
          ? {
              name: typeof prizeRaw.name === "string" ? prizeRaw.name : undefined,
              value: typeof prizeRaw.value === "string" ? prizeRaw.value : undefined,
              imageUrl: typeof prizeRaw.imageUrl === "string" ? prizeRaw.imageUrl : undefined,
              description:
                typeof prizeRaw.description === "string" ? prizeRaw.description : undefined,
            }
          : null;
        return {
          id: doc.id,
          title: typeof data.title === "string" ? data.title : doc.id,
          description: typeof data.description === "string" ? data.description : "",
          prize,
        } satisfies LandingGiveaway;
      })
      .filter((g) => g.prize?.name)
      .slice(0, 6);

    const businessMap = new Map(
      businessesSnap.docs.map((doc) => {
        const data = doc.data() as { name?: string; logoUrl?: string };
        return [doc.id, { name: data.name ?? doc.id, logoUrl: data.logoUrl ?? null }];
      }),
    );

    const partners: PartnerLogo[] = [];
    const seenLogos = new Set<string>();

    businessMap.forEach((biz, id) => {
      if (!biz.logoUrl || seenLogos.has(biz.logoUrl)) return;
      seenLogos.add(biz.logoUrl);
      partners.push({ name: biz.name ?? id, logo: biz.logoUrl });
    });

    locationsSnap.docs.forEach((doc) => {
      const data = doc.data() as { name?: string; logoUrl?: string; businessId?: string };
      if (!data.logoUrl || seenLogos.has(data.logoUrl)) return;
      seenLogos.add(data.logoUrl);
      const businessId = data.businessId ?? doc.ref.parent.parent?.id;
      const businessName = businessId ? businessMap.get(businessId)?.name : null;
      const locationName = data.name ?? doc.id;
      const displayName = businessName ? `${businessName} · ${locationName}` : locationName;
      partners.push({ name: displayName, logo: data.logoUrl });
    });

    partners.sort((a, b) => {
      const nameCompare = a.name.localeCompare(b.name);
      if (nameCompare !== 0) return nameCompare;
      return a.logo.localeCompare(b.logo);
    });

    return { donations, causes, giveaways, totalDonationCents, partners, error: null };
  } catch (err) {
    console.error("Landing data fetch failed:", err);
    return {
      donations: [],
      causes: [],
      giveaways: [],
      totalDonationCents: 0,
      partners: [],
      error: err instanceof Error ? err.message : "Failed to load landing data.",
    };
  }
}

function formatMoney(cents: number | null | undefined) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function pointsLabel(cause: LandingCause, source: "in_person" | "remote") {
  const config = resolvePointsConfig(cause as unknown as CauseDoc, source);
  if (config.mode === "predefined") {
    const uniquePoints = Array.from(
      new Set(
        (config.predefinedOptions ?? [])
          .map((option) => option.points)
          .filter((points) => Number.isFinite(points) && points >= 0),
      ),
    ).sort((a, b) => a - b);

    if (uniquePoints.length === 0) return "0 pts";
    if (uniquePoints.length === 1) return `${uniquePoints[0]} pts`;
    if (uniquePoints.length <= 3) return `${uniquePoints.join(" / ")} pts`;
    return `${uniquePoints[0]}-${uniquePoints[uniquePoints.length - 1]} pts`;
  }
  const rate = typeof config.pointsPerDollar === "number" ? config.pointsPerDollar : 0;
  return `${rate} pts / $`;
}

export default async function Home() {
  const { donations, causes, giveaways, totalDonationCents, partners, error } = await fetchLandingData();

  return (
    <PublicShell contentClassName="flex flex-col gap-0">
        {/* ── 1. Hero ── */}
        <header className="relative pb-20 pt-8 sm:pt-16">
          {/* Decorative gradient blob */}
          <div className="pointer-events-none absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full bg-emerald-500/[0.07] blur-[120px]" />
          <div className="pointer-events-none absolute right-0 top-0 h-[400px] w-[400px] rounded-full bg-white/[0.03] blur-[100px]" />

          <div className="relative space-y-5 lg:max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
              Give back &middot; Earn rewards
            </span>
            <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              Turn everyday purchases into&nbsp;impact.
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-zinc-300 sm:text-xl">
              Rack Up connects local businesses, generous supporters, and community causes. To support
              and earn points, visit a participating location and scan the in-store QR code tied
              to the cause.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-400 px-7 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 hover:shadow-emerald-500/30"
                href="/signup"
              >
                Get started
              </Link>
              <Link
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/30 px-7 text-sm font-semibold text-white transition hover:bg-white/10"
                href="/rewards"
              >
                See rewards
              </Link>
            </div>
          </div>

          {/* Live activity ticker */}
          <div className="mt-10">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Live activity
            </div>
            {donations.length === 0 ? (
              <div className="mt-3 text-sm text-zinc-400">
                Support activity will appear here once campaigns are active.
              </div>
            ) : (
              <div className="hide-scrollbar mt-3 flex gap-3 overflow-x-auto pb-2">
                {donations.slice(0, 8).map((d) => (
                  <div
                    key={d.id}
                    className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm"
                  >
                    <span className="font-semibold text-white">{formatMoney(d.amountCents)}</span>
                    <span className="text-zinc-400">&rarr;</span>
                    <span className="text-zinc-300">{d.causeTitle ?? "a cause"}</span>
                    <span className="text-xs text-zinc-500">{formatDate(d.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* ── 2. Stats Bar ── */}
        <section className="pb-20">
          <div className="flex flex-col items-center divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.03] sm:flex-row sm:divide-x sm:divide-y-0">
            <div className="flex flex-1 flex-col items-center px-6 py-5">
              <div className="text-3xl font-bold tracking-tight text-white">{formatMoney(totalDonationCents)}</div>
              <div className="mt-1 text-xs font-medium uppercase tracking-widest text-zinc-500">Total supported</div>
            </div>
            <div className="flex flex-1 flex-col items-center px-6 py-5">
              <div className="text-3xl font-bold tracking-tight text-white">{donations.length}</div>
              <div className="mt-1 text-xs font-medium uppercase tracking-widest text-zinc-500">Recent supporters</div>
            </div>
            <div className="flex flex-1 flex-col items-center px-6 py-5">
              <div className="text-3xl font-bold tracking-tight text-white">{causes.length}</div>
              <div className="mt-1 text-xs font-medium uppercase tracking-widest text-zinc-500">Active causes</div>
            </div>
          </div>
        </section>

        {/* ── 3. How It Works (full-width band) ── */}
        <section className="-mx-4 border-y border-white/5 bg-white/[0.02] px-4 py-16 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 h-1 w-10 rounded-full bg-emerald-400" />
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">How it works</h2>
              <p className="mt-2 max-w-lg text-sm text-zinc-400">
                Support causes, earn points, and qualify for prizes in three simple steps.
              </p>
            </div>

            <div className="mt-12 grid gap-10 sm:grid-cols-3">
              <div className="text-center">
                <div className="text-5xl font-bold text-emerald-400/20">01</div>
                <h3 className="mt-2 text-lg font-semibold text-white">Scan a QR code</h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                  Visit a participating location and scan the in-store QR code, or use a shared remote link.
                </p>
              </div>
              <div className="text-center">
                <div className="text-5xl font-bold text-emerald-400/20">02</div>
                <h3 className="mt-2 text-lg font-semibold text-white">Support a cause</h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                  Choose an amount to donate. In-person visits earn the most points, but remote support counts too.
                </p>
              </div>
              <div className="text-center">
                <div className="text-5xl font-bold text-emerald-400/20">03</div>
                <h3 className="mt-2 text-lg font-semibold text-white">Earn rewards &amp; prizes</h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                  Community drawings are held monthly. Entry thresholds and multipliers can vary by community drawing,
                  and your carryover points continue between donations until an entry is reached.
                </p>
              </div>
            </div>

            <div className="mt-8 rounded-xl border border-emerald-300/20 bg-emerald-500/[0.08] p-4 text-sm text-emerald-100">
              <span className="font-semibold">Community drawing entry rules:</span> drawings happen once per month,
              and entry credit is cumulative per community drawing using that community drawing&apos;s configured threshold.
            </div>
            <ClientOnly>
              <GiveawayProgressCard className="mt-3" />
            </ClientOnly>

            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link
                className="inline-flex h-11 items-center justify-center rounded-full bg-emerald-300 px-6 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-400/20 transition hover:bg-emerald-200"
                href="/donate"
              >
                Donate in person
              </Link>
              <Link
                className="inline-flex h-11 items-center justify-center rounded-full border border-emerald-200/50 px-6 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-200/10"
                href="/donate/remote"
              >
                Support from home
              </Link>
              <LandingEligibilityCta />
            </div>
          </div>
        </section>

        {/* ── 4. Active Community Drawings ── */}
        <section className="space-y-8 py-20">
          <div className="flex flex-col items-center text-center">
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Live prizes
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Current community drawing items</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Win prizes by supporting verified causes.
            </p>
          </div>
          <LandingCommunityDrawings drawings={giveaways} />
        </section>

        {/* ── 5. Featured Partners ── */}
        <FeaturedPartners partners={partners} />

        {/* ── 6. Featured Causes (unified) ── */}
        <section className="space-y-6 py-20">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Featured causes</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Visit a participating location to scan the QR code, or use a shared link to support remotely.
              </p>
            </div>
            <Link className="text-sm font-medium text-emerald-300 transition hover:text-emerald-200" href="/rewards">
              See rewards &rarr;
            </Link>
          </div>
          {error ? (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              Unable to load causes: {error}
            </div>
          ) : null}
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {causes.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-zinc-300">
                Causes will appear here as businesses add campaigns.
              </div>
            ) : (
              causes.slice(0, 6).map((cause) => (
                <div
                  key={cause.id}
                  className="group flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.05]"
                >
                  <div className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                    {cause.businessId ?? "Partner"}
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">{cause.title}</div>
                  {cause.description ? (
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-zinc-300">{cause.description}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 font-semibold text-emerald-200">
                      In-person: {pointsLabel(cause, "in_person")}
                    </span>
                    <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 font-semibold text-zinc-300">
                      Remote: {pointsLabel(cause, "remote")}
                    </span>
                  </div>
                  <div className="mt-auto flex items-center gap-3 pt-4">
                    <Link
                      href={`/donate/remote/${cause.id}`}
                      className="inline-flex h-9 items-center justify-center rounded-full bg-emerald-400 px-4 text-xs font-semibold text-emerald-950 shadow-md shadow-emerald-500/15 transition hover:bg-emerald-300"
                    >
                      Support from home
                    </Link>
                    <Link
                      href={`/causes/${cause.id}`}
                      className="text-xs font-semibold text-emerald-300 transition hover:text-emerald-200"
                    >
                      View details &rarr;
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ── 7. Recent Impact (horizontal scroll band) ── */}
        <section className="-mx-4 border-y border-white/5 bg-white/[0.02] px-4 py-16 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Recent impact</h2>
            <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">Anonymous snapshots</span>
          </div>
          {donations.length === 0 ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-zinc-300">
              No support yet — be the first to create an impact.
            </div>
          ) : (
            <div
              className="hide-scrollbar mt-6 flex gap-4 overflow-x-auto pb-2"
              style={{ maskImage: "linear-gradient(to right, black 90%, transparent)", WebkitMaskImage: "linear-gradient(to right, black 90%, transparent)" }}
            >
              {donations.slice(0, 8).map((d) => (
                <div
                  key={d.id}
                  className="w-64 shrink-0 rounded-xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-white/20"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xl font-bold text-white">{formatMoney(d.amountCents)}</div>
                    <div className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                      +{typeof d.points === "number" ? d.points : 0} pts
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-zinc-300">
                    {d.causeTitle ?? "A community cause"} at {d.businessName ?? "partner location"}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">{formatDate(d.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 8. Final CTA ── */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-emerald-500/20 via-emerald-400/10 to-transparent p-12 text-white shadow-2xl my-20">
          <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="relative flex flex-col items-center text-center">
            <div className="text-xs font-medium uppercase tracking-widest text-emerald-300">
              Ready to make a difference?
            </div>
            <div className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Join Rack Up today.</div>
            <div className="mt-3 max-w-md text-sm leading-relaxed text-emerald-100/80">
              Visit a participating location or use a shared link to support and earn points.
            </div>
            <div className="mt-6 flex gap-3">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-emerald-900 shadow-lg transition hover:opacity-90"
              >
                Create account
              </Link>
              <Link
                href="/rewards"
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/30 px-6 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Explore rewards
              </Link>
            </div>
          </div>
        </section>

        <div className="text-center text-xs text-zinc-500">
          Built for trusted payments and flexible rewards.
        </div>

        <div className="pb-8">
          <ClientOnly>
            <LandingAuthActions />
          </ClientOnly>
        </div>
    </PublicShell>
  );
}
