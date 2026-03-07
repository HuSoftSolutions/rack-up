import Link from "next/link";
import PublicShell from "@/app/_components/PublicNav";
import FeaturedPartners, { type PartnerLogo } from "@/app/_components/FeaturedPartners";
import { adminFirestore } from "@/lib/firebase/admin";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

async function fetchPartners(): Promise<PartnerLogo[]> {
  noStore();
  try {
    const [businessesSnap, locationsSnap] = await Promise.all([
      adminFirestore.collection("businesses").where("active", "==", true).get(),
      adminFirestore.collectionGroup("locations").get(),
    ]);

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

    partners.sort((a, b) => a.name.localeCompare(b.name) || a.logo.localeCompare(b.logo));
    return partners;
  } catch (err) {
    console.error("Failed to fetch partners for /donate:", err);
    return [];
  }
}

const steps = [
  {
    number: "01",
    title: "Find a partner location",
    description:
      "Visit any participating Rack Up business. Look for the QR code displayed in-store.",
  },
  {
    number: "02",
    title: "Scan the QR code",
    description:
      "Open your phone camera and scan. You'll be taken directly to the cause page — no app required.",
  },
  {
    number: "03",
    title: "Support & earn points",
    description:
      "Pick an amount, complete your support securely, and earn points toward community drawings.",
  },
];

export default async function DonateIndexPage() {
  const partners = await fetchPartners();

  return (
    <PublicShell contentClassName="flex flex-col gap-0">
      {/* ── Hero ── */}
      <header className="relative pb-16 pt-8 sm:pt-16">
        <div className="pointer-events-none absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full bg-emerald-500/[0.07] blur-[120px]" />
        <div className="pointer-events-none absolute right-0 top-0 h-[400px] w-[400px] rounded-full bg-white/[0.03] blur-[100px]" />

        <div className="relative space-y-5 lg:max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
            In-person &middot; Remote
          </span>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            Support causes that&nbsp;matter.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-zinc-300 sm:text-xl">
            Visit a participating location and scan the in-store QR code, or
            support remotely from anywhere. Every contribution earns points
            toward community drawings.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-400 px-7 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 hover:shadow-emerald-500/30"
              href="/donate/remote"
            >
              Support from home
            </Link>
            <Link
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/30 px-7 text-sm font-semibold text-white transition hover:bg-white/10"
              href="/rewards"
            >
              See rewards
            </Link>
          </div>
        </div>
      </header>

      {/* ── How It Works ── */}
      <section className="-mx-4 border-y border-white/5 bg-white/[0.02] px-4 py-16 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 h-1 w-10 rounded-full bg-emerald-400" />
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              How it works
            </h2>
            <p className="mt-2 max-w-lg text-sm text-zinc-400">
              Three simple steps to support a cause and earn rewards.
            </p>
          </div>

          <div className="mt-12 grid gap-10 sm:grid-cols-3">
            {steps.map((step) => (
              <div key={step.number} className="text-center">
                <div className="text-5xl font-bold text-emerald-400/20">
                  {step.number}
                </div>
                <h3 className="mt-2 text-lg font-semibold text-white">
                  {step.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Support Options ── */}
      <section className="space-y-6 py-16">
        <div className="flex flex-col items-center text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Choose how to support
          </h2>
          <p className="mt-2 max-w-md text-sm text-zinc-400">
            In-person visits earn the most points, but remote support counts
            too.
          </p>
        </div>

        <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
          {/* In-person card */}
          <div className="group relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-emerald-300/40 hover:bg-white/[0.05]">
            <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-lg text-emerald-300">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="M9.638 1.093a.75.75 0 0 1 .724 0l2 1.104a.75.75 0 1 1-.724 1.313L10 2.607l-1.638.903a.75.75 0 1 1-.724-1.313l2-1.104ZM5.403 4.287a.75.75 0 0 1-.295 1.019l-.805.444.805.444a.75.75 0 0 1-.724 1.314L3.5 7.02v.73a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 1 .388-.657l1.996-1.1a.75.75 0 0 1 1.019.294Zm9.194 0a.75.75 0 0 1 1.02-.295l1.995 1.101A.75.75 0 0 1 18 5.75v2a.75.75 0 0 1-1.5 0v-.73l-.884.488a.75.75 0 1 1-.724-1.314l.806-.444-.806-.444a.75.75 0 0 1-.295-1.02ZM7.343 8.284a.75.75 0 0 1 1.02-.294L10 8.893l1.638-.903a.75.75 0 1 1 .724 1.313l-1.612.89v1.557a.75.75 0 0 1-1.5 0v-1.557l-1.612-.89a.75.75 0 0 1-.295-1.019ZM2.75 11.5a.75.75 0 0 1 .75.75v1.557l1.608.887a.75.75 0 0 1-.724 1.314l-1.996-1.101A.75.75 0 0 1 2 14.25v-2a.75.75 0 0 1 .75-.75Zm14.5 0a.75.75 0 0 1 .75.75v2a.75.75 0 0 1-.388.657l-1.996 1.1a.75.75 0 1 1-.724-1.313l1.608-.887V12.25a.75.75 0 0 1 .75-.75Zm-7.25 4a.75.75 0 0 1 .75.75v.73l.888-.49a.75.75 0 0 1 .724 1.313l-2 1.104a.75.75 0 0 1-.724 0l-2-1.104a.75.75 0 1 1 .724-1.313l.888.49v-.73a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
              </svg>
            </span>
            <h3 className="text-lg font-semibold text-white">In-person</h3>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">
              Scan the QR code at any partner location. Earn the highest point
              rate for in-store visits.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                Max points
              </span>
            </div>
          </div>

          {/* Remote card */}
          <Link
            href="/donate/remote"
            className="group relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-emerald-300/40 hover:bg-white/[0.05]"
          >
            <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-lg text-emerald-300">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H4.598a.75.75 0 0 0-.75.75v3.634a.75.75 0 0 0 1.5 0v-2.033a6.999 6.999 0 0 0 11.215-3.007.75.75 0 0 0-1.251-.999ZM4.688 8.576a5.5 5.5 0 0 1 9.201-2.466l.312.311H11.767a.75.75 0 0 0 0 1.5h3.635a.75.75 0 0 0 .75-.75V3.537a.75.75 0 0 0-1.5 0v2.033A6.999 6.999 0 0 0 3.437 8.576a.75.75 0 0 0 1.251 1Z" />
              </svg>
            </span>
            <h3 className="text-lg font-semibold text-white">
              Remote
              <span className="ml-2 inline-flex items-center text-xs font-medium text-emerald-300 opacity-0 transition group-hover:opacity-100">
                Browse causes &rarr;
              </span>
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">
              Support from anywhere using a shared link. No visit needed — your
              contribution still earns points.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-zinc-300">
                Support from home
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* ── Featured Partners ── */}
      <section className="pb-16">
        <FeaturedPartners partners={partners} />
      </section>

      {/* ── CTA ── */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-emerald-500/20 via-emerald-400/10 to-transparent p-12 text-white shadow-2xl mb-16">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex flex-col items-center text-center">
          <div className="text-xs font-medium uppercase tracking-widest text-emerald-300">
            Ready to make a difference?
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Start supporting today.
          </div>
          <div className="mt-3 max-w-md text-sm leading-relaxed text-emerald-100/80">
            Create an account to track your points, enter community drawings,
            and see your impact grow.
          </div>
          <div className="mt-6 flex gap-3">
            <Link
              href="/signup"
              className="inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-emerald-900 shadow-lg transition hover:opacity-90"
            >
              Create account
            </Link>
            <Link
              href="/donate/remote"
              className="inline-flex h-11 items-center justify-center rounded-full border border-white/30 px-6 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Browse causes
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
