import { notFound } from "next/navigation";
import DonateClient from "../../../start-donation";
import { fetchDonationConfig } from "@/lib/server/firestore";
import { resolvePointsConfig } from "@/lib/server/points-config";
import { inspectQrToken } from "@/lib/server/qr-access";

type Props = {
  params: Promise<{ businessSlug: string; causeSlug: string; locationSlug: string }>;
  searchParams?:
    | { qr?: string | string[] }
    | Promise<{ qr?: string | string[] }>;
};

type TimestampLike = {
  toMillis?: () => number;
  _seconds?: number;
  _nanoseconds?: number;
};

function isTimestampLike(value: unknown): value is TimestampLike {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.toMillis === "function" || typeof record._seconds === "number";
}

function serializeTimestamp(value: unknown): number | null {
  if (!value) return null;
  if (isTimestampLike(value)) {
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value._seconds === "number") {
      const nanos = typeof value._nanoseconds === "number" ? value._nanoseconds : 0;
      return value._seconds * 1000 + Math.floor(nanos / 1_000_000);
    }
  }
  return typeof value === "number" ? value : null;
}

function serializeDoc<T extends Record<string, unknown>>(doc: T) {
  return {
    ...doc,
    createdAt: serializeTimestamp(doc.createdAt),
    updatedAt: serializeTimestamp(doc.updatedAt),
  };
}

export default async function DonationPage({ params, searchParams }: Props) {
  const { businessSlug, causeSlug, locationSlug } = await params;
  const query = searchParams ? await Promise.resolve(searchParams) : {};
  const qrValue = query?.qr;
  const qrTokenValue = Array.isArray(qrValue) ? qrValue[0] : qrValue ?? null;
  const qrInspect = inspectQrToken(qrTokenValue);
  const scanSource: "in_person" | "remote" = qrInspect.ok ? qrInspect.payload.s : "remote";
  const qrDebugEnabled = process.env.QR_DEBUG === "1";
  const qrDebugMessage =
    qrDebugEnabled && !qrInspect.ok ? `token ${qrInspect.reason}; fallback to remote` : null;
  if (qrDebugEnabled && !qrInspect.ok) {
    console.warn("[qr-debug] in-person donation route fallback", {
      reason: qrInspect.reason,
      businessSlug,
      causeSlug,
      locationSlug,
    });
  }
  const config = await fetchDonationConfig({ businessSlug, causeSlug, locationSlug });
  if (!config) notFound();
  const pointsConfig = resolvePointsConfig(config.cause, scanSource);

  return (
    <DonateClient
      business={serializeDoc(config.business)}
      cause={serializeDoc(config.cause)}
      location={serializeDoc(config.location)}
      scanSource={scanSource}
      pointsConfig={pointsConfig}
      qrToken={qrTokenValue}
      qrDebugMessage={qrDebugMessage}
    />
  );
}
