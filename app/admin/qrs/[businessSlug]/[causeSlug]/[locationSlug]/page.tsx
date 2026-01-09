import { notFound } from "next/navigation";
import { fetchDonationConfig } from "@/lib/server/firestore";
import PrintableQr from "./printable-client";

type Props = {
  params: Promise<{ businessSlug: string; causeSlug: string; locationSlug: string }>;
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

export default async function QRPrintablePage({ params }: Props) {
  const { businessSlug, causeSlug, locationSlug } = await params;
  const config = await fetchDonationConfig({ businessSlug, causeSlug, locationSlug });
  if (!config) notFound();

  return (
    <PrintableQr
      config={{
        business: serialize(config.business),
        cause: serialize(config.cause),
        location: serialize(config.location),
      }}
    />
  );
}
