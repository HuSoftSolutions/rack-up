import Link from "next/link";
import LandingAuthActions from "@/app/_components/LandingAuthActions";
import { adminFirestore } from "@/lib/firebase/admin";
import { ClientOnly } from "@/app/_components/ClientOnly";
import PublicShell from "@/app/_components/PublicNav";
import FeaturedPartners from "@/app/_components/FeaturedPartners";

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
  pointsPerDollar?: number;
  minAmountCents?: number;
  maxAmountCents?: number;
};

async function fetchLandingData(): Promise<{
  donations: LandingDonation[];
  causes: LandingCause[];
  totalDonationCents: number;
}> {
  try {
    const donationSnap = await adminFirestore
      .collection("donations")
      .where("status", "==", "completed")
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

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

    const causeSnap = await adminFirestore.collectionGroup("causes").limit(8).get();
    const causes = causeSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title ?? doc.id,
        description: data.description ?? "",
        businessId: data.businessId ?? doc.ref.parent.parent?.id,
        pointsPerDollar: data.pointsPerDollar ?? null,
        minAmountCents: data.minAmountCents ?? null,
        maxAmountCents: data.maxAmountCents ?? null,
      } satisfies LandingCause;
    });

    return { donations, causes, totalDonationCents };
  } catch {
    return { donations: [], causes: [], totalDonationCents: 0 };
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

export default async function Home() {
  const { donations, causes, totalDonationCents } = await fetchLandingData();

  return (
    <PublicShell contentClassName="flex flex-col gap-12">
        <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-10 shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.07),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(52,211,153,0.12),transparent_35%)]" />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-4 lg:max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
                Give back • Earn rewards
              </span>
              <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                Turn everyday purchases into impact.
              </h1>
              <p className="text-lg text-zinc-200 sm:text-xl">
                Rack Up connects local businesses, generous donors, and community causes. To donate
                and earn points, visit a participating location and scan the in-store QR code tied
                to the cause.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-400 px-6 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300"
                  href="/signup"
                >
                  Get started
                </Link>
                <Link
                  className="inline-flex h-12 items-center justify-center rounded-full border border-white/30 px-6 text-sm font-semibold text-white transition hover:bg-white/10"
                  href="/rewards"
                >
                  See rewards
                </Link>
              </div>
            </div>
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-black/60 p-5 shadow-xl backdrop-blur">
              <div className="text-sm font-semibold text-emerald-300">Live activity</div>
              {donations.length === 0 ? (
                <div className="mt-3 text-sm text-zinc-400">
                  Donations will appear here once campaigns are active.
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {donations.slice(0, 4).map((d) => (
                    <div
                      key={d.id}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    >
                      <div className="font-medium text-white">
                        {formatMoney(d.amountCents)} to {d.causeTitle ?? "a cause"}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {d.businessName ?? "Partner"} · {formatDate(d.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        <section>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-400">Total donated</div>
              <div className="mt-2 text-3xl font-semibold text-white">
                {formatMoney(totalDonationCents)}
              </div>
              <div className="mt-1 text-sm text-zinc-400">
                Donations happen in person via QR at participating locations.
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-400">Recent donors</div>
              <div className="mt-2 text-3xl font-semibold text-white">{donations.length}</div>
              <div className="mt-1 text-sm text-zinc-400">
                Anonymous activity preview from the last 20 donations.
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-400">Active causes</div>
              <div className="mt-2 text-3xl font-semibold text-white">{causes.length}</div>
              <div className="mt-1 text-sm text-zinc-400">
                Live causes available via in-person QR scan.
              </div>
            </div>
          </div>
        </section>

        <FeaturedPartners />

        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white">Featured causes</h2>
              <p className="text-sm text-zinc-400">
                Visit a participating location to scan the QR code and donate in person.
              </p>
            </div>
            <Link className="text-sm text-emerald-300 underline" href="/rewards">
              See rewards
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {causes.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                Causes will appear here as businesses add campaigns.
              </div>
            ) : (
              causes.map((cause) => (
                <div
                  key={cause.id}
                  className="group h-full rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:-translate-y-1 hover:border-emerald-300/60 hover:shadow-2xl"
                >
                  <div className="text-xs uppercase tracking-wide text-zinc-400">
                    {cause.businessId ?? "Partner"}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-white">{cause.title}</div>
                  {cause.description ? (
                    <p className="mt-1 text-sm text-zinc-300 line-clamp-3">{cause.description}</p>
                  ) : null}
                  <div className="mt-3 flex items-center gap-3 text-xs text-zinc-400">
                    {cause.pointsPerDollar ? (
                      <span className="rounded-full border border-emerald-300/40 bg-emerald-400/10 px-2 py-1 font-semibold text-emerald-200">
                        {cause.pointsPerDollar} pts / $
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/20 px-2 py-1 font-semibold text-white/80">
                        Flexible points
                      </span>
                    )}
                    <span>
                      Min {formatMoney(cause.minAmountCents)} · Max {formatMoney(cause.maxAmountCents)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold tracking-tight text-white">Recent impact</h2>
            <span className="text-sm text-zinc-400">Anonymous snapshots</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {donations.slice(0, 8).map((d) => (
              <div
                key={d.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold">{formatMoney(d.amountCents)}</div>
                  <div className="text-xs text-emerald-200">
                    +{typeof d.points === "number" ? d.points : 0} pts issued
                  </div>
                </div>
                <div className="mt-1 text-zinc-300">
                  {d.causeTitle ?? "A community cause"} at {d.businessName ?? "partner location"}
                </div>
                <div className="mt-1 text-xs text-zinc-500">{formatDate(d.createdAt)}</div>
              </div>
            ))}
            {donations.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                No donations yet — be the first to create an impact.
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-emerald-500/20 via-emerald-400/10 to-transparent p-8 text-white shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-emerald-200">
                Ready to make a difference?
              </div>
              <div className="mt-2 text-2xl font-semibold">Join Rack Up today.</div>
              <div className="text-sm text-emerald-100/90">
                Visit a participating location to donate in person and earn points.
              </div>
            </div>
            <div className="flex gap-3">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-emerald-900 transition hover:opacity-90"
              >
                Create account
              </Link>
              <Link
                href="/rewards"
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/30 px-5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Explore rewards
              </Link>
            </div>
          </div>
        </section>

        <div className="mt-4 text-center text-xs text-zinc-500">
          Built for trusted payments and flexible rewards.
        </div>

        <div className="mt-6">
          <ClientOnly>
            <LandingAuthActions />
          </ClientOnly>
        </div>
    </PublicShell>
  );
}
