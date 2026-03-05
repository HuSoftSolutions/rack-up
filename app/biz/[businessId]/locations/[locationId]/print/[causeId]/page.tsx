import { notFound } from "next/navigation";
import PrintableQr from "@/app/admin/qrs/[businessSlug]/[causeSlug]/[locationSlug]/printable-client";
import { adminFirestore } from "@/lib/firebase/admin";
import { fetchDonationConfig } from "@/lib/server/firestore";
import { createCauseQrToken } from "@/lib/server/qr-access";

type Props = {
  params: Promise<{ businessId: string; locationId: string; causeId: string }>;
};

type Timestampish =
  | { toMillis?: () => number; _seconds?: number; _nanoseconds?: number }
  | null
  | undefined;

type WithTimestamps<T extends Record<string, unknown>> = T & {
  createdAt?: Timestampish;
  updatedAt?: Timestampish;
};

function toMillis(ts: Timestampish) {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts._seconds === "number") {
    return ts._seconds * 1000 + Math.floor((ts._nanoseconds ?? 0) / 1_000_000);
  }
  return null;
}

function serialize<T extends Record<string, unknown>>(doc: WithTimestamps<T>) {
  return {
    ...doc,
    createdAt: toMillis(doc.createdAt ?? null),
    updatedAt: toMillis(doc.updatedAt ?? null),
  };
}

export default async function LocationCausePrintPage({ params }: Props) {
  const { businessId, locationId, causeId } = await params;
  const businessSnap = await adminFirestore.collection("businesses").doc(businessId).get();
  if (!businessSnap.exists) return notFound();
  const businessData = businessSnap.data() as { slug?: string };
  const businessSlug = businessData.slug ?? businessId;

  const config = await fetchDonationConfig({
    businessSlug,
    causeSlug: causeId,
    locationSlug: locationId,
  });
  if (!config) notFound();

  return (
    <PrintableQr
      config={{
        business: serialize(config.business),
        cause: serialize(config.cause),
        location: serialize(config.location),
        qrToken: createCauseQrToken({
          businessSlug,
          causeSlug: causeId,
          locationSlug: locationId,
        }),
      }}
      backHref={`/biz/${businessId}/locations/${locationId}/print`}
      backLabel="← Back to print options"
    />
  );
}
