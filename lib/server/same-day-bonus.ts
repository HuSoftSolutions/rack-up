import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import type { BusinessDoc, BusinessType } from "@/lib/types/business";

export type SameDayBonusConfig = {
  enabled: boolean;
  bonusPoints: number;
  timezone: string;
  updatedAt?: Timestamp;
};

const DEFAULT_CONFIG: SameDayBonusConfig = {
  enabled: false,
  bonusPoints: 20,
  timezone: "America/New_York",
};

function asBool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asInt(value: unknown, fallback = 0, min = 0, max = 1_000_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function asTimezone(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return trimmed;
  } catch {
    return fallback;
  }
}

export function normalizeSameDayBonusConfig(value: unknown): SameDayBonusConfig {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    enabled: asBool(record.enabled, DEFAULT_CONFIG.enabled),
    bonusPoints: asInt(record.bonusPoints, DEFAULT_CONFIG.bonusPoints, 0, 1_000_000),
    timezone: asTimezone(record.timezone, DEFAULT_CONFIG.timezone),
  };
}

export async function getSameDayBonusConfig(): Promise<SameDayBonusConfig> {
  const snap = await adminFirestore.collection("platform_config").doc("same_day_bonus").get();
  if (!snap.exists) return DEFAULT_CONFIG;
  return normalizeSameDayBonusConfig(snap.data());
}

export function localDateKey(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function timezoneOffsetMs(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const asIfUtc = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")) % 24,
    Number(get("minute")),
    Number(get("second")),
  );
  return asIfUtc - date.getTime();
}

function startOfLocalDayUtc(date: Date, timezone: string): Date {
  const dateKey = localDateKey(date, timezone);
  const offsetMs = timezoneOffsetMs(date, timezone);
  const midnightAsUtc = new Date(`${dateKey}T00:00:00Z`).getTime();
  return new Date(midnightAsUtc - offsetMs);
}

async function getBusinessTypesForIds(
  businessIds: string[],
): Promise<Map<string, BusinessType>> {
  const result = new Map<string, BusinessType>();
  if (businessIds.length === 0) return result;
  const unique = Array.from(new Set(businessIds));
  const snaps = await Promise.all(
    unique.map((id) => adminFirestore.collection("businesses").doc(id).get()),
  );
  snaps.forEach((snap, index) => {
    if (!snap.exists) return;
    const data = snap.data() as BusinessDoc;
    const type: BusinessType = data.type === "gym" ? "gym" : "partner";
    result.set(unique[index], type);
  });
  return result;
}

export type SameDayBonusResult = {
  awarded: boolean;
  pointsAwarded: number;
  reason?:
    | "disabled"
    | "no_business"
    | "no_opposite_type"
    | "already_awarded"
    | "bonus_zero";
};

/**
 * Check + award same-day bonus after a successful scan claim.
 * Awards once per user per local-timezone day when both a gym scan and a
 * partner scan have been recorded today.
 */
export async function maybeAwardSameDayBonus(params: {
  userId: string;
  scanEventId: string;
  scannedBusinessId: string | null;
  now: Timestamp;
}): Promise<SameDayBonusResult> {
  const { userId, scanEventId, scannedBusinessId, now } = params;

  if (!scannedBusinessId) {
    return { awarded: false, pointsAwarded: 0, reason: "no_business" };
  }

  const config = await getSameDayBonusConfig();
  if (!config.enabled) {
    return { awarded: false, pointsAwarded: 0, reason: "disabled" };
  }
  if (config.bonusPoints <= 0) {
    return { awarded: false, pointsAwarded: 0, reason: "bonus_zero" };
  }

  const nowDate = now.toDate();
  const dateKey = localDateKey(nowDate, config.timezone);
  const dayStart = Timestamp.fromDate(startOfLocalDayUtc(nowDate, config.timezone));

  const [scannedBizSnap, todayClaimsSnap] = await Promise.all([
    adminFirestore.collection("businesses").doc(scannedBusinessId).get(),
    adminFirestore
      .collection("scan_event_claim_events")
      .where("userId", "==", userId)
      .where("createdAt", ">=", dayStart)
      .get(),
  ]);

  if (!scannedBizSnap.exists) {
    return { awarded: false, pointsAwarded: 0, reason: "no_business" };
  }
  const scannedBiz = scannedBizSnap.data() as BusinessDoc;
  const scannedType: BusinessType = scannedBiz.type === "gym" ? "gym" : "partner";
  const oppositeType: BusinessType = scannedType === "gym" ? "partner" : "gym";

  const otherBusinessIds: string[] = [];
  todayClaimsSnap.docs.forEach((doc) => {
    const data = doc.data() as {
      association?: { businessId?: string | null };
    };
    const bizId = data.association?.businessId;
    if (bizId && bizId !== scannedBusinessId) otherBusinessIds.push(bizId);
  });

  if (otherBusinessIds.length === 0) {
    return { awarded: false, pointsAwarded: 0, reason: "no_opposite_type" };
  }

  const otherTypes = await getBusinessTypesForIds(otherBusinessIds);
  const hasOpposite = Array.from(otherTypes.values()).some((t) => t === oppositeType);
  if (!hasOpposite) {
    return { awarded: false, pointsAwarded: 0, reason: "no_opposite_type" };
  }

  const bonusRef = adminFirestore
    .collection("same_day_bonus_claims")
    .doc(`${userId}_${dateKey}`);

  let awarded = false;
  let pointsAwarded = 0;

  await adminFirestore.runTransaction(async (tx) => {
    const existing = await tx.get(bonusRef);
    if (existing.exists) return;

    pointsAwarded = config.bonusPoints;
    awarded = true;

    tx.set(bonusRef, {
      userId,
      dateKey,
      timezone: config.timezone,
      pointsAwarded,
      triggeringScanEventId: scanEventId,
      triggeringBusinessId: scannedBusinessId,
      triggeringType: scannedType,
      createdAt: now,
    });

    const transactionRef = adminFirestore.collection("transactions").doc();
    tx.set(transactionRef, {
      type: "same_day_bonus",
      status: "completed",
      pointsDelta: pointsAwarded,
      amountCents: null,
      userId,
      causeId: null,
      businessId: scannedBusinessId,
      locationId: null,
      scanSource: "same_day_bonus",
      scanEventId,
      sameDayBonusDateKey: dateKey,
      createdAt: now,
      updatedAt: now,
    });
  });

  if (!awarded) {
    return { awarded: false, pointsAwarded: 0, reason: "already_awarded" };
  }
  return { awarded: true, pointsAwarded };
}
