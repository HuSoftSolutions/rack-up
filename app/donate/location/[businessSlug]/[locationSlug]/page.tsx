import { notFound } from "next/navigation";
import PublicShell from "@/app/_components/PublicNav";
import QrAccessRequired from "@/app/donate/_components/QrAccessRequired";
import { Badge } from "@/ui-kit/badge";
import { Button } from "@/ui-kit/button";
import { Heading } from "@/ui-kit/heading";
import { Text } from "@/ui-kit/text";
import { adminFirestore } from "@/lib/firebase/admin";
import { createCauseQrToken, validateLocationQrToken } from "@/lib/server/qr-access";
import type { CauseDoc, LocationDoc } from "@/lib/types/business";

type CauseOption = CauseDoc & { id: string; linkId: string };

type LocationDonationData = {
  business: { id: string; name: string; slug: string };
  location: LocationDoc & { id: string };
  causes: CauseOption[];
};

async function fetchLocationDonations(
  businessSlug: string,
  locationSlug: string,
): Promise<LocationDonationData | null> {
  const businessRef = adminFirestore.collection("businesses").doc(businessSlug);
  const businessSnap = await businessRef.get();
  if (!businessSnap.exists) return null;
  const businessData = businessSnap.data() as { name?: string; slug?: string };

  const locationSnap = await businessRef.collection("locations").doc(locationSlug).get();
  if (!locationSnap.exists) return null;
  const location = {
    id: locationSnap.id,
    ...(locationSnap.data() as LocationDoc),
  };

  const [linksSnap, globalCausesSnap] = await Promise.all([
    businessRef.collection("cause_links").get(),
    adminFirestore.collection("causes").get(),
  ]);

  const globalMap = new Map(
    globalCausesSnap.docs.map((doc) => [doc.id, { id: doc.id, ...(doc.data() as CauseDoc) }]),
  );

  const causes: CauseOption[] = [];
  linksSnap.docs.forEach((linkDoc) => {
    const link = linkDoc.data() as { causeId?: string; locationIds?: string[] };
    const causeId = link.causeId || linkDoc.id;
    const cause = globalMap.get(causeId);
    if (!cause || cause.active === false) return;
    if (link.locationIds && link.locationIds.length > 0 && !link.locationIds.includes(locationSnap.id)) {
      return;
    }
    causes.push({ ...cause, linkId: linkDoc.id });
  });

  causes.sort((a, b) => (a.title ?? a.id).localeCompare(b.title ?? b.id));

  return {
    business: {
      id: businessRef.id,
      name: businessData.name ?? businessRef.id,
      slug: businessData.slug ?? businessRef.id,
    },
    location,
    causes,
  };
}

function pointsSummary(cause: CauseOption) {
  if (cause.mode === "predefined" && cause.predefinedOptions?.length) {
    const options = cause.predefinedOptions
      .map((opt) => `${(opt.amountCents / 100).toFixed(2)} = ${opt.points} pts`)
      .join(", ");
    return `Preset options: ${options}.`;
  }
  const min = cause.minAmountCents ? `$${(cause.minAmountCents / 100).toFixed(2)}` : null;
  const max = cause.maxAmountCents ? `$${(cause.maxAmountCents / 100).toFixed(2)}` : null;
  const range = min && max ? `${min}-${max}` : min ? `from ${min}` : max ? `up to ${max}` : "";
  const rate = cause.pointsPerDollar ?? 100;
  return `Donate any amount${range ? ` (${range})` : ""} and earn ${rate} points per $1.`;
}

export default async function DonateLocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string; locationSlug: string }>;
  searchParams?: { qr?: string | string[] };
}) {
  const { businessSlug, locationSlug } = await params;
  const qrParam = Array.isArray(searchParams?.qr) ? searchParams?.qr[0] : searchParams?.qr ?? null;
  const hasAccess = validateLocationQrToken(qrParam, { businessSlug, locationSlug });
  if (!hasAccess) {
    return <QrAccessRequired />;
  }
  const data = await fetchLocationDonations(businessSlug, locationSlug);
  if (!data) notFound();

  return (
    <PublicShell contentClassName="max-w-5xl space-y-8">
      <header className="space-y-3">
        <Badge color="emerald">Donate</Badge>
        <Heading level={1} className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Choose a charity at {data.business.name}
        </Heading>
        <Text className="text-zinc-200">
          Location: {data.location.name ?? data.location.id}. Select a cause below to donate
          securely and earn Rack Up points.
        </Text>
      </header>

      {data.causes.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-zinc-200 shadow-lg shadow-black/30">
          No causes are available at this location right now. Please check back soon.
        </div>
      ) : (
        <div className="space-y-4">
          {data.causes.map((cause) => (
            <div
              key={cause.linkId}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/30"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <Heading level={2} className="text-xl font-semibold text-white">
                    {cause.title ?? cause.id}
                  </Heading>
                  {cause.description ? (
                    <Text className="text-zinc-300">{cause.description}</Text>
                  ) : null}
                  <Text className="text-xs text-zinc-400">{pointsSummary(cause)}</Text>
                </div>
                <Button
                  href={`/donate/${businessSlug}/${cause.linkId}/${locationSlug}?qr=${encodeURIComponent(
                    createCauseQrToken({
                      businessSlug,
                      locationSlug,
                      causeSlug: cause.linkId,
                    }),
                  )}`}
                  color="emerald"
                >
                  Donate to this cause
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PublicShell>
  );
}
