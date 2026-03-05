import { redirect } from "next/navigation";
import DonateClient from "../../start-donation";
import { adminFirestore } from "@/lib/firebase/admin";
import { resolvePointsConfig } from "@/lib/server/points-config";
import type { BusinessDoc, CauseDoc } from "@/lib/types/business";

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

async function fetchRemoteCauseConfig(causeSlug: string): Promise<{
  business: Pick<BusinessDoc, "name" | "slug" | "description"> & { id: string };
  cause: CauseDoc & { id: string };
} | null> {
  const globalSnap = await adminFirestore.collection("causes").doc(causeSlug).get();
  if (!globalSnap.exists) return null;
  const globalData = globalSnap.data() as CauseDoc;
  if (globalData.active === false) return null;

  return {
    business: {
      id: "remote",
      name: "Remote support",
      slug: "remote",
    },
    cause: { id: globalSnap.id, ...(globalData as CauseDoc) },
  };
}

export default async function DonateRemoteMaybeCausePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?:
    | { qr?: string | string[] }
    | Promise<{ qr?: string | string[] }>;
}) {
  const { slug } = await params;
  const query = searchParams ? await Promise.resolve(searchParams) : {};
  const qrValue = query?.qr;
  const qrTokenValue = Array.isArray(qrValue) ? qrValue[0] : qrValue ?? null;

  const config = await fetchRemoteCauseConfig(slug);
  if (!config) {
    const target = qrTokenValue ? `/donate/remote?qr=${encodeURIComponent(qrTokenValue)}` : "/donate/remote";
    redirect(target);
  }

  const pointsConfig = resolvePointsConfig(config.cause, "remote");

  return (
    <DonateClient
      business={serializeDoc(config.business)}
      cause={serializeDoc(config.cause)}
      location={null}
      scanSource="remote"
      pointsConfig={pointsConfig}
      qrToken={qrTokenValue}
    />
  );
}
