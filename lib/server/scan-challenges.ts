import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import {
  DAY_MS,
  isValidTimezone,
  localDateKey,
  startOfLocalWeekUtc,
  weekStartKey,
} from "@/lib/server/time";
import type { ScanEventAssociation } from "@/lib/types/scan-event";
import type {
  ScanChallengeDoc,
  ScanChallengeScope,
  ScanChallengeThreshold,
  ScanChallengeWindow,
} from "@/lib/types/scan-challenge";

const DEFAULT_TIMEZONE = "America/New_York";

/* ------------------------------------------------------------------ */
/* Normalization (admin input + tolerant read of stored docs)         */
/* ------------------------------------------------------------------ */

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

function asPositiveInt(value: unknown, fallback: number, min = 1, max = 1_000_000): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean)),
  );
}

function sanitizeId(value: unknown, fallback: string): string {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned || fallback;
}

function asTimestampOrNull(value: unknown): Timestamp | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  if (typeof value === "object" && typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return value as Timestamp;
  }
  if (typeof value === "object" && value !== null && "_seconds" in value) {
    const ts = value as { _seconds: number; _nanoseconds?: number };
    return new Timestamp(ts._seconds, ts._nanoseconds ?? 0);
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return Timestamp.fromDate(date);
  }
  return null;
}

function normalizeWindow(value: unknown): ScanChallengeWindow {
  const record = parseRecord(value);
  const type =
    record.type === "rolling_days"
      ? "rolling_days"
      : record.type === "challenge_period"
        ? "challenge_period"
        : "calendar_week";
  const timezone = isValidTimezone(record.timezone) ? (record.timezone as string).trim() : DEFAULT_TIMEZONE;
  if (type === "rolling_days") {
    return { type, timezone, days: asPositiveInt(record.days, 7, 1, 366) };
  }
  if (type === "challenge_period") {
    return { type, timezone };
  }
  return { type, timezone, weekStartsOn: asPositiveInt(record.weekStartsOn, 1, 1, 7) };
}

function normalizeScope(value: unknown): ScanChallengeScope {
  const record = parseRecord(value);
  return {
    matchMode: record.matchMode === "any" ? "any" : "all",
    businessIds: asStringArray(record.businessIds),
    causeIds: asStringArray(record.causeIds),
    locationIds: asStringArray(record.locationIds),
    scanEventIds: asStringArray(record.scanEventIds),
  };
}

function normalizeThresholds(value: unknown): ScanChallengeThreshold[] {
  const raw = Array.isArray(value) ? value : [];
  const seenCounts = new Set<number>();
  const seenIds = new Set<string>();
  const thresholds: ScanChallengeThreshold[] = [];
  for (const entry of raw) {
    const record = parseRecord(entry);
    const scanCount = asPositiveInt(record.scanCount, 0, 1, 100_000);
    if (!scanCount || seenCounts.has(scanCount)) continue;
    seenCounts.add(scanCount);
    let id = sanitizeId(record.id, `s${scanCount}`);
    while (seenIds.has(id)) id = `${id}_`;
    seenIds.add(id);
    thresholds.push({ id, scanCount, entries: asPositiveInt(record.entries, 1, 1, 10_000) });
  }
  thresholds.sort((a, b) => a.scanCount - b.scanCount);
  return thresholds;
}

/** Strict normalization for admin create/update. Throws on invalid input. */
export function normalizeScanChallengeInput(
  value: unknown,
): Omit<ScanChallengeDoc, "createdAt" | "updatedAt"> {
  const record = parseRecord(value);

  const title = asString(record.title);
  if (!title) throw new Error("title is required.");

  const thresholds = normalizeThresholds(record.thresholds);
  if (thresholds.length === 0) {
    throw new Error("At least one threshold is required (e.g. 3 scans → 1 entry).");
  }

  const giveawayRecord = parseRecord(record.giveaway);
  const targetMode = giveawayRecord.targetMode === "all_active" ? "all_active" : "selected";
  const giveawayIds = asStringArray(giveawayRecord.giveawayIds);
  if (targetMode === "selected" && giveawayIds.length === 0) {
    throw new Error("Select at least one giveaway, or use targetMode 'all_active'.");
  }

  const window = normalizeWindow(record.window);
  const startsAt = asTimestampOrNull(record.startsAt);
  if (window.type === "challenge_period" && !startsAt) {
    throw new Error("A start date is required when the window is the entire challenge period.");
  }

  return {
    title,
    active: asBoolean(record.active, true),
    window,
    scope: normalizeScope(record.scope),
    // Default: every valid scan counts. distinct_events is an explicit opt-in.
    countMode: record.countMode === "distinct_events" ? "distinct_events" : "claims",
    thresholds,
    giveaway: { targetMode, giveawayIds },
    startsAt,
    endsAt: asTimestampOrNull(record.endsAt),
  };
}

/** Tolerant read of a stored challenge doc; returns null if unusable. */
function readChallenge(id: string, data: unknown): (ScanChallengeDoc & { id: string }) | null {
  try {
    const normalized = normalizeScanChallengeInput(data);
    return { id, ...normalized, createdAt: Timestamp.now() };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

type ClaimEventData = {
  scanEventId?: string;
  association?: ScanEventAssociation | null;
};

export function scanMatchesScope(
  scope: ScanChallengeScope,
  scanEventId: string | undefined,
  association: ScanEventAssociation | null | undefined,
): boolean {
  const checks: boolean[] = [];
  if (scope.scanEventIds.length > 0) {
    checks.push(Boolean(scanEventId) && scope.scanEventIds.includes(String(scanEventId)));
  }
  if (scope.businessIds.length > 0) {
    checks.push(Boolean(association?.businessId) && scope.businessIds.includes(String(association?.businessId)));
  }
  if (scope.causeIds.length > 0) {
    checks.push(Boolean(association?.causeId) && scope.causeIds.includes(String(association?.causeId)));
  }
  if (scope.locationIds.length > 0) {
    checks.push(Boolean(association?.locationId) && scope.locationIds.includes(String(association?.locationId)));
  }
  if (checks.length === 0) return true;
  return scope.matchMode === "any" ? checks.some(Boolean) : checks.every(Boolean);
}

/** Constant period key for challenge_period windows — one bucket per challenge. */
export const CAMPAIGN_PERIOD_KEY = "campaign";

function resolveWindow(
  window: ScanChallengeWindow,
  now: Date,
  startsAt: Timestamp | null | undefined,
): { start: Date; periodKey: string } {
  if (window.type === "challenge_period") {
    // startsAt is guaranteed by normalizeScanChallengeInput for this type.
    return { start: startsAt?.toDate() ?? now, periodKey: CAMPAIGN_PERIOD_KEY };
  }
  if (window.type === "rolling_days") {
    const days = window.days ?? 7;
    // Daily bucket so a sliding window can't re-award the same rung repeatedly.
    return { start: new Date(now.getTime() - days * DAY_MS), periodKey: localDateKey(now, window.timezone) };
  }
  const weekStartsOn = window.weekStartsOn ?? 1;
  return {
    start: startOfLocalWeekUtc(now, window.timezone, weekStartsOn),
    periodKey: weekStartKey(now, window.timezone, weekStartsOn),
  };
}

/**
 * Period key a given claim falls into, matching the live award key scheme so
 * backfilled entries collide (dedupe) with live-awarded ones.
 * rolling_days is intentionally unsupported: live keys are award-day based and
 * cannot be reproduced from claim history — callers must reject that case.
 */
export function periodKeyForClaim(window: ScanChallengeWindow, claimDate: Date): string {
  if (window.type === "challenge_period") return CAMPAIGN_PERIOD_KEY;
  if (window.type === "rolling_days") {
    throw new Error("Backfill is not supported for rolling-day windows.");
  }
  return weekStartKey(claimDate, window.timezone, window.weekStartsOn ?? 1);
}

export async function resolveTargetGiveawayIds(giveaway: {
  targetMode: "selected" | "all_active";
  giveawayIds: string[];
}): Promise<string[]> {
  if (giveaway.targetMode === "all_active") {
    const snap = await adminFirestore.collection("giveaways").where("status", "==", "active").get();
    return snap.docs.map((doc) => doc.id);
  }
  const ids = asStringArray(giveaway.giveawayIds);
  if (ids.length === 0) return [];
  const snaps = await adminFirestore.getAll(
    ...ids.map((id) => adminFirestore.collection("giveaways").doc(id)),
  );
  const valid: string[] = [];
  snaps.forEach((snap) => {
    if (!snap.exists) return;
    const status = (snap.data() as { status?: string } | undefined)?.status ?? "draft";
    // Match the scan-claim path: entries may accrue to active or draft giveaways.
    if (status === "active" || status === "draft") valid.push(snap.id);
  });
  return valid;
}

/** Deterministic id for a challenge-earned giveaway entry — shared by live awards and backfills. */
export function challengeEntryId(params: {
  giveawayId: string;
  challengeId: string;
  userId: string;
  periodKey: string;
  thresholdId: string;
}): string {
  return `${params.giveawayId}_challenge_${params.challengeId}_${params.userId}_${params.periodKey}_${params.thresholdId}`;
}

/** Entry document body — shared by live awards and backfills so the two are byte-identical. */
export function buildChallengeEntry(params: {
  giveawayId: string;
  userId: string;
  challengeId: string;
  threshold: ScanChallengeThreshold;
  periodKey: string;
  now: Timestamp;
  triggeringScanEventId?: string | null;
  backfilled?: boolean;
}) {
  return {
    giveawayId: params.giveawayId,
    donationId: null,
    userId: params.userId,
    entriesCount: params.threshold.entries,
    pointsApplied: 0,
    pointsCarryIn: 0,
    pointsCarryOut: 0,
    entryUnitPoints: null,
    entryMultiplier: null,
    scanSource: "scan_challenge",
    amountCents: null,
    sourceType: "scan_challenge",
    scanChallengeId: params.challengeId,
    scanChallengeThresholdId: params.threshold.id,
    scanChallengeScanCount: params.threshold.scanCount,
    scanChallengePeriodKey: params.periodKey,
    triggeringScanEventId: params.triggeringScanEventId ?? null,
    ...(params.backfilled ? { backfilled: true, backfilledAt: params.now } : {}),
    createdAt: params.now,
    updatedAt: params.now,
  };
}

async function awardChallenge(
  challenge: ScanChallengeDoc & { id: string },
  params: { userId: string; scanEventId: string; association: ScanEventAssociation | null; now: Timestamp },
): Promise<number> {
  const { userId, scanEventId, association, now } = params;
  const nowDate = now.toDate();

  // Time-boxing.
  if (challenge.startsAt && now.toMillis() < challenge.startsAt.toMillis()) return 0;
  if (challenge.endsAt && now.toMillis() > challenge.endsAt.toMillis()) return 0;

  // Only re-evaluate when the triggering scan itself counts toward this challenge.
  if (!scanMatchesScope(challenge.scope, scanEventId, association)) return 0;

  const { start, periodKey } = resolveWindow(challenge.window, nowDate, challenge.startsAt);

  const eventsSnap = await adminFirestore
    .collection("scan_event_claim_events")
    .where("userId", "==", userId)
    .where("createdAt", ">=", Timestamp.fromDate(start))
    .get();

  const matching = eventsSnap.docs
    .map((doc) => doc.data() as ClaimEventData)
    .filter((data) => scanMatchesScope(challenge.scope, data.scanEventId, data.association));

  const count =
    challenge.countMode === "distinct_events"
      ? new Set(matching.map((data) => data.scanEventId).filter(Boolean)).size
      : matching.length;

  const metThresholds = challenge.thresholds.filter((threshold) => count >= threshold.scanCount);
  if (metThresholds.length === 0) return 0;

  const giveawayIds = await resolveTargetGiveawayIds(challenge.giveaway);
  if (giveawayIds.length === 0) return 0;

  const entriesCol = adminFirestore.collection("giveaway_entries");
  const candidates: Array<{ giveawayId: string; threshold: ScanChallengeThreshold }> = [];
  for (const giveawayId of giveawayIds) {
    for (const threshold of metThresholds) {
      candidates.push({ giveawayId, threshold });
    }
  }
  if (candidates.length === 0) return 0;

  const refs = candidates.map(({ giveawayId, threshold }) =>
    entriesCol.doc(
      challengeEntryId({ giveawayId, challengeId: challenge.id, userId, periodKey, thresholdId: threshold.id }),
    ),
  );
  const existing = await adminFirestore.getAll(...refs);

  const batch = adminFirestore.batch();
  let awardedEntries = 0;
  let writes = 0;
  existing.forEach((snap, index) => {
    if (snap.exists) return; // already awarded this rung for this period — idempotent no-op
    const { giveawayId, threshold } = candidates[index];
    batch.set(
      refs[index],
      buildChallengeEntry({
        giveawayId,
        userId,
        challengeId: challenge.id,
        threshold,
        periodKey,
        now,
        triggeringScanEventId: scanEventId,
      }),
    );
    awardedEntries += threshold.entries;
    writes += 1;
  });

  if (writes > 0) await batch.commit();
  return awardedEntries;
}

/**
 * Check + award weekly scan-challenge entries after a successful scan claim.
 * Runs as a non-critical side effect: callers should swallow errors so the
 * primary claim response is never blocked. Dormant until at least one active
 * `scan_challenges` doc exists.
 */
export async function maybeAwardScanChallengeEntries(params: {
  userId: string;
  scanEventId: string;
  association: ScanEventAssociation | null;
  now: Timestamp;
}): Promise<{ awarded: boolean; entriesAwarded: number }> {
  const activeSnap = await adminFirestore.collection("scan_challenges").where("active", "==", true).get();
  if (activeSnap.empty) return { awarded: false, entriesAwarded: 0 };

  let entriesAwarded = 0;
  for (const doc of activeSnap.docs) {
    const challenge = readChallenge(doc.id, doc.data());
    if (!challenge) continue;
    try {
      entriesAwarded += await awardChallenge(challenge, params);
    } catch {
      // One malformed/failing challenge must not sink the others.
    }
  }

  return { awarded: entriesAwarded > 0, entriesAwarded };
}
