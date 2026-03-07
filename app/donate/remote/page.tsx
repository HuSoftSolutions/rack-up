import PublicShell from "@/app/_components/PublicNav";
import { Badge } from "@/ui-kit/badge";
import { Heading } from "@/ui-kit/heading";
import { Text } from "@/ui-kit/text";
import CauseSelectionList from "@/app/donate/_components/CauseSelectionList";
import { adminFirestore } from "@/lib/firebase/admin";
import { createRemoteCauseQrToken } from "@/lib/server/qr-access";
import { resolvePointsConfig } from "@/lib/server/points-config";
import type { CauseDoc } from "@/lib/types/business";

type CauseOption = CauseDoc & { id: string };

async function fetchRemoteCauses(): Promise<CauseOption[]> {
  const causesSnap = await adminFirestore.collection("causes").get();
  const causes = causesSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as CauseDoc) }))
    .filter((cause) => cause.active !== false);
  causes.sort((a, b) => (a.title ?? a.id).localeCompare(b.title ?? b.id));
  return causes;
}

function pointsSummary(cause: CauseOption, source: "in_person" | "remote") {
  const config = resolvePointsConfig(cause, source);
  if (config.mode === "predefined" && config.predefinedOptions?.length) {
    const options = [...config.predefinedOptions]
      .sort((a, b) => a.amountCents - b.amountCents)
      .map((opt) => `$${(opt.amountCents / 100).toFixed(2)} -> ${opt.points} pts`)
      .join(", ");
    return options;
  }
  const min = cause.minAmountCents ? `$${(cause.minAmountCents / 100).toFixed(2)}` : null;
  const max = cause.maxAmountCents ? `$${(cause.maxAmountCents / 100).toFixed(2)}` : null;
  const range = min && max ? `${min}-${max}` : min ? `from ${min}` : max ? `up to ${max}` : "";
  const rate = config.pointsPerDollar ?? 100;
  return `Support any amount${range ? ` (${range})` : ""} and earn ${rate} points per $1.`;
}

export default async function DonateRemoteLandingPage() {
  const causes = await fetchRemoteCauses();

  return (
    <PublicShell contentClassName="max-w-5xl space-y-8">
      <header className="space-y-3">
        <Badge color="emerald">Support</Badge>
        <Heading level={1} className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Choose a charity to support
        </Heading>
        <Text className="text-zinc-200">
          Remote support. Select a cause below to support securely and earn Rack Up points.
        </Text>
      </header>

      {causes.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-zinc-200 shadow-lg shadow-black/30">
          No causes are available right now. Please check back soon.
        </div>
      ) : (
        <CauseSelectionList
          causes={causes.map((cause) => ({
            id: cause.id,
            title: cause.title ?? cause.id,
            description: cause.description,
            imageUrl: cause.imageUrl,
            pointsDetails: {
              inPerson: pointsSummary(cause, "in_person"),
              remote: pointsSummary(cause, "remote"),
            },
            supportHref: `/donate/remote/${cause.id}?qr=${encodeURIComponent(
              createRemoteCauseQrToken({ causeSlug: cause.id }),
            )}`,
          }))}
        />
      )}
    </PublicShell>
  );
}
