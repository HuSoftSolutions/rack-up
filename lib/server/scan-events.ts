import crypto from "crypto";
import type {
  PublicScanEvent,
  ScanEventAssociation,
  ScanEventAssociationType,
  ScanEventCadence,
  ScanEventCadenceUnit,
  ScanEventDoc,
  ScanEventRewards,
} from "@/lib/types/scan-event";

type ScanTokenPayload = {
  v: 1;
  eventId: string;
};

export type ScanTokenInspectResult =
  | { ok: true; eventId: string }
  | { ok: false; reason: "missing" | "malformed" | "invalid_signature" | "invalid_payload" };

const SCAN_SECRET_ENV = "SCAN_EVENT_QR_SECRET";
const FALLBACK_SECRET_ENV = "DONATION_QR_SECRET";

function requireSecret(): Buffer {
  const secret = process.env[SCAN_SECRET_ENV] ?? process.env[FALLBACK_SECRET_ENV];
  if (!secret) {
    throw new Error(`Missing required env var: ${SCAN_SECRET_ENV} (or ${FALLBACK_SECRET_ENV})`);
  }
  return Buffer.from(secret, "utf8");
}

function base64UrlEncode(value: Buffer | string): string {
  const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = padded.length % 4 === 0 ? 0 : 4 - (padded.length % 4);
  return Buffer.from(padded + "=".repeat(padLength), "base64");
}

function sign(encodedPayload: string) {
  const hmac = crypto.createHmac("sha256", requireSecret());
  hmac.update(encodedPayload);
  return base64UrlEncode(hmac.digest());
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function parseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asPositiveInt(value: unknown, fallback: number, min = 1, max = 10000): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function normalizeAssociationType(value: unknown): ScanEventAssociationType {
  if (value === "charity") return "charity";
  if (value === "business_location") return "business_location";
  if (value === "custom") return "custom";
  return "standalone";
}

function normalizeCadenceUnit(value: unknown): ScanEventCadenceUnit {
  if (value === "days") return "days";
  if (value === "weeks") return "weeks";
  return "hours";
}

export function normalizeScanEventInput(value: unknown): Omit<ScanEventDoc, "createdAt" | "updatedAt"> {
  const record = parseRecord(value);
  const associationRecord = parseRecord(record.association);
  const cadenceRecord = parseRecord(record.cadence);
  const rewardsRecord = parseRecord(record.rewards);
  const pointsRecord = parseRecord(rewardsRecord.points);
  const giveawayRecord = parseRecord(rewardsRecord.giveaway);

  const associationType = normalizeAssociationType(associationRecord.type);
  const association: ScanEventAssociation = {
    type: associationType,
    causeId: asString(associationRecord.causeId) ?? null,
    businessId: asString(associationRecord.businessId) ?? null,
    locationId: asString(associationRecord.locationId) ?? null,
    customLabel: asString(associationRecord.customLabel) ?? null,
  };
  if (associationType !== "charity") association.causeId = null;
  if (associationType !== "business_location") {
    association.businessId = null;
    association.locationId = null;
  } else if (!association.businessId) {
    throw new Error("businessId is required for business/location association.");
  }
  if (associationType !== "custom") association.customLabel = null;

  const cadence: ScanEventCadence = {
    unit: normalizeCadenceUnit(cadenceRecord.unit),
    interval: asPositiveInt(cadenceRecord.interval, 24, 1, 365),
  };

  const rewards: ScanEventRewards = {
    points: {
      enabled: asBoolean(pointsRecord.enabled, false),
      amount: asPositiveInt(pointsRecord.amount, 0, 0, 1_000_000),
    },
    giveaway: {
      enabled: asBoolean(giveawayRecord.enabled, false),
      targetMode: giveawayRecord.targetMode === "all_active" ? "all_active" : "selected",
      giveawayIds: asStringArray(giveawayRecord.giveawayIds),
      entries: asPositiveInt(giveawayRecord.entries, 1, 1, 1000),
    },
  };
  const legacyGiveawayId = asString(giveawayRecord.giveawayId);
  if (legacyGiveawayId && rewards.giveaway.giveawayIds.length === 0) {
    rewards.giveaway.giveawayIds = [legacyGiveawayId];
  }
  if (!rewards.points.enabled) rewards.points.amount = 0;
  if (
    rewards.giveaway.enabled &&
    rewards.giveaway.targetMode === "selected" &&
    rewards.giveaway.giveawayIds.length === 0
  ) {
    throw new Error("Select at least one giveaway when giveaway entries are enabled.");
  }
  if (!rewards.giveaway.enabled) {
    rewards.giveaway.targetMode = "selected";
    rewards.giveaway.giveawayIds = [];
    rewards.giveaway.entries = 1;
  }
  if (!rewards.points.enabled && !rewards.giveaway.enabled) {
    throw new Error("At least one reward must be enabled (points or giveaway entries).");
  }

  const title = asString(record.title);
  if (!title) throw new Error("title is required.");

  return {
    title,
    description: asString(record.description) ?? null,
    active: asBoolean(record.active, true),
    association,
    cadence,
    rewards,
    imageUrl: asString(record.imageUrl) ?? null,
    imagePath: asString(record.imagePath) ?? null,
  };
}

export function mapScanEventDocToPublic(id: string, data: ScanEventDoc): PublicScanEvent {
  return {
    id,
    title: data.title,
    description: data.description ?? undefined,
    imageUrl: data.imageUrl ?? null,
    cadence: data.cadence,
    rewards: data.rewards,
    association: data.association,
  };
}

export function createScanEventToken(eventId: string): string {
  const payload: ScanTokenPayload = { v: 1, eventId };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function inspectScanEventToken(token: string | null | undefined): ScanTokenInspectResult {
  if (!token) return { ok: false, reason: "missing" };
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return { ok: false, reason: "malformed" };
  const expected = sign(encoded);
  if (!timingSafeEqual(signature, expected)) return { ok: false, reason: "invalid_signature" };
  try {
    const parsed = JSON.parse(base64UrlDecode(encoded).toString("utf8")) as ScanTokenPayload;
    if (!parsed || parsed.v !== 1 || !parsed.eventId) {
      return { ok: false, reason: "invalid_payload" };
    }
    return { ok: true, eventId: parsed.eventId };
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }
}

export function cadenceToMs(cadence: ScanEventCadence): number {
  const interval = Math.max(1, Math.floor(cadence.interval));
  if (cadence.unit === "weeks") return interval * 7 * 24 * 60 * 60 * 1000;
  if (cadence.unit === "days") return interval * 24 * 60 * 60 * 1000;
  return interval * 60 * 60 * 1000;
}

export function formatCadence(cadence: ScanEventCadence): string {
  const interval = Math.max(1, Math.floor(cadence.interval));
  if (cadence.unit === "hours") return interval === 1 ? "Every hour" : `Every ${interval} hours`;
  if (cadence.unit === "days") return interval === 1 ? "Daily" : `Every ${interval} days`;
  return interval === 1 ? "Weekly" : `Every ${interval} weeks`;
}
