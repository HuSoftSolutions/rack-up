import Image from "next/image";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { adminFirestore } from "@/lib/firebase/admin";
import PublicShell from "@/app/_components/PublicNav";
import { Badge } from "@/ui-kit/badge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CauseDetails = {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  pointsPerDollar?: number;
  minAmountCents?: number;
  maxAmountCents?: number;
  mode: "custom" | "predefined";
  predefinedOptions?: { amountCents: number; points: number; label?: string }[];
  active: boolean;
};

function formatMoney(cents: number | null | undefined) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function fetchCause(causeId: string): Promise<CauseDetails | null> {
  noStore();
  const doc = await adminFirestore.collection("causes").doc(causeId).get();
  if (!doc.exists) return null;
  const data = doc.data() as Partial<CauseDetails> | undefined;
  if (!data) return null;
  return {
    id: doc.id,
    title: data.title ?? doc.id,
    description: data.description ?? "",
    imageUrl: data.imageUrl,
    pointsPerDollar: data.pointsPerDollar ?? undefined,
    minAmountCents: data.minAmountCents ?? undefined,
    maxAmountCents: data.maxAmountCents ?? undefined,
    mode: (data.mode as CauseDetails["mode"]) ?? "custom",
    predefinedOptions: data.predefinedOptions ?? [],
    active: data.active ?? true,
  };
}

export default async function CauseDetailsPage({
  params,
}: {
  params: Promise<{ causeId: string }>;
}) {
  const { causeId } = await params;
  const cause = await fetchCause(causeId);
  if (!cause) return notFound();

  return (
    <PublicShell contentClassName="max-w-4xl space-y-8">
      <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl">
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={cause.active ? "emerald" : "red"}>
                {cause.active ? "Active cause" : "Inactive"}
              </Badge>
              <span className="text-xs uppercase tracking-wide text-zinc-400">
                {cause.mode === "predefined" ? "Predefined options" : "Custom donation"}
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {cause.title}
            </h1>
            {cause.description ? (
              <p className="text-sm text-zinc-300 sm:text-base">{cause.description}</p>
            ) : null}
            <div className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
              Donations are only available in person. Visit a participating location and scan the
              QR code for this cause to donate and earn points.
            </div>
          </div>
          {cause.imageUrl ? (
            <div className="w-full max-w-xs overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-4">
              <Image
                src={cause.imageUrl}
                alt={cause.title}
                width={400}
                height={300}
                className="h-48 w-full object-contain"
              />
            </div>
          ) : null}
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase tracking-wide text-zinc-400">Points</div>
          <div className="mt-2 text-xl font-semibold text-white">
            {cause.mode === "predefined"
              ? `${cause.predefinedOptions?.length ?? 0} options`
              : `${cause.pointsPerDollar ?? 100} pts / $`}
          </div>
          <div className="mt-1 text-sm text-zinc-400">
            {cause.mode === "predefined" ? "Choose from preset donations." : "Earn with every dollar."}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase tracking-wide text-zinc-400">Minimum</div>
          <div className="mt-2 text-xl font-semibold text-white">{formatMoney(cause.minAmountCents)}</div>
          <div className="mt-1 text-sm text-zinc-400">Per in‑person donation.</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase tracking-wide text-zinc-400">Maximum</div>
          <div className="mt-2 text-xl font-semibold text-white">{formatMoney(cause.maxAmountCents)}</div>
          <div className="mt-1 text-sm text-zinc-400">Per in‑person donation.</div>
        </div>
      </section>

      {cause.mode === "predefined" && cause.predefinedOptions?.length ? (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-sm font-semibold text-white">Donation options</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {cause.predefinedOptions.map((opt) => (
              <div key={`${opt.amountCents}-${opt.points}`} className="rounded-xl border border-white/10 bg-black/40 p-3">
                <div className="text-sm font-semibold text-white">
                  {formatMoney(opt.amountCents)}
                </div>
                <div className="text-xs text-emerald-200">{opt.points} pts</div>
                {opt.label ? <div className="mt-1 text-xs text-zinc-400">{opt.label}</div> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </PublicShell>
  );
}
