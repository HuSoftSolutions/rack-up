import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import { DAY_MS, startOfLocalWeekUtc, weekStartKey, zonedDateTimeToUtc } from "@/lib/server/time";
import {
  asStringArray,
  buildChallengeEntry,
  challengeEntryId,
  normalizeScanChallengeInput,
  periodKeyForClaim,
  resolveTargetGiveawayIds,
  scanMatchesScope,
} from "@/lib/server/scan-challenges";
import type { ScanChallengeThreshold } from "@/lib/types/scan-challenge";
import type { ScanEventAssociation } from "@/lib/types/scan-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type BackfillBody = {
  mode?: "preview" | "commit";
  startDate?: string;
  endDate?: string;
  countMode?: "distinct_events" | "claims";
  thresholds?: Array<{ scanCount?: unknown; entries?: unknown }>;
  targetMode?: "selected" | "all_active";
  giveawayIds?: string[];
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * Parse a client-supplied date string. Naive "YYYY-MM-DDTHH:mm" values (from
 * <input type="datetime-local">) are interpreted in the challenge timezone so
 * an admin's browser timezone can't shift the range; ISO strings pass through.
 */
function parseClientDate(value: string | undefined, timezone: string): Date | null {
  if (!value || typeof value !== "string") return null;
  const zoned = zonedDateTimeToUtc(value, timezone);
  if (zoned) return zoned;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Normalize per-run tier overrides. Where a tier's scanCount matches a stored
 * tier, the stored threshold id is reused so backfill entry ids collide with
 * (dedupe against) live-awarded entries even for custom-id challenges.
 */
function normalizeOverrideThresholds(
  raw: unknown,
  stored: ScanChallengeThreshold[],
): ScanChallengeThreshold[] {
  if (!Array.isArray(raw)) return [];
  const storedByCount = new Map(stored.map((t) => [t.scanCount, t.id]));
  const seen = new Set<number>();
  const out: ScanChallengeThreshold[] = [];
  for (const entry of raw) {
    const rec = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const scanCount = Math.floor(Number(rec.scanCount));
    const entries = Math.floor(Number(rec.entries));
    if (!Number.isFinite(scanCount) || scanCount < 1 || scanCount > 100_000 || seen.has(scanCount)) continue;
    if (!Number.isFinite(entries) || entries < 1 || entries > 10_000) continue;
    seen.add(scanCount);
    out.push({ id: storedByCount.get(scanCount) ?? `s${scanCount}`, scanCount, entries });
  }
  out.sort((a, b) => a.scanCount - b.scanCount);
  return out;
}

type ClaimData = {
  userId?: string;
  scanEventId?: string;
  association?: ScanEventAssociation | null;
  createdAt?: Timestamp;
};

export async function POST(request: Request, context: { params: Promise<{ challengeId: string }> }) {
  try {
    await requireAdmin(request);
    const { challengeId } = await context.params;
    if (!challengeId) return badRequest("challengeId is required.");

    let body: BackfillBody;
    try {
      body = (await request.json()) as BackfillBody;
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const mode = body.mode === "commit" ? "commit" : "preview";

    const challengeSnap = await adminFirestore.collection("scan_challenges").doc(challengeId).get();
    if (!challengeSnap.exists) {
      return NextResponse.json({ error: "Scan challenge not found." }, { status: 404 });
    }
    const challenge = normalizeScanChallengeInput(challengeSnap.data());
    const window = challenge.window;
    const tz = window.timezone;

    if (window.type === "rolling_days") {
      return badRequest(
        "Backfill is not supported for rolling-day windows: live awards are keyed by the day a member crossed the goal, which cannot be reproduced from history. Switch the challenge to a calendar week or entire-period window first.",
      );
    }

    // ---- Effective rules: stored config, with explicit (never silent) overrides ----
    const countMode =
      body.countMode === "claims" || body.countMode === "distinct_events" ? body.countMode : challenge.countMode;

    let thresholds = challenge.thresholds;
    if (Array.isArray(body.thresholds)) {
      thresholds = normalizeOverrideThresholds(body.thresholds, challenge.thresholds);
      if (thresholds.length === 0) {
        return badRequest("No valid tiers were provided. Each tier needs a scan count and entries of at least 1.");
      }
    }

    const targetMode =
      body.targetMode === "all_active" || body.targetMode === "selected" ? body.targetMode : challenge.giveaway.targetMode;
    let giveawayIds = challenge.giveaway.giveawayIds;
    if (Array.isArray(body.giveawayIds)) {
      giveawayIds = asStringArray(body.giveawayIds);
      if (targetMode === "selected" && giveawayIds.length === 0) {
        return badRequest("No giveaways are selected. Pick at least one giveaway, or use \"all active\".");
      }
    }
    const resolvedGiveawayIds = await resolveTargetGiveawayIds({ targetMode, giveawayIds });
    if (resolvedGiveawayIds.length === 0) return badRequest("No eligible giveaways to receive entries.");

    const warnings: string[] = [];
    if (targetMode === "all_active") {
      warnings.push(
        "\"All active\" targets giveaways that are active right now — not the ones that were active during the backfill period.",
      );
    }

    // ---- Effective date window, clamped to the challenge's own time box ----
    const now = new Date();
    const challengeStart = challenge.startsAt?.toDate() ?? null;
    const challengeEnd = challenge.endsAt?.toDate() ?? null;

    let effectiveStart: Date;
    let effectiveEnd: Date;
    let queryStart: Date;
    let queryEnd: Date;
    let awardableWeeks: Set<string> | null = null;

    if (window.type === "challenge_period") {
      // The challenge defines its own single period; client dates are ignored.
      effectiveStart = challengeStart as Date; // guaranteed by normalize for this type
      effectiveEnd = challengeEnd && challengeEnd.getTime() < now.getTime() ? challengeEnd : now;
      if (effectiveStart.getTime() > effectiveEnd.getTime()) {
        return badRequest("The challenge period has not started yet.");
      }
      queryStart = effectiveStart;
      queryEnd = effectiveEnd;
    } else {
      const rawStart = parseClientDate(body.startDate, tz);
      const rawEnd = parseClientDate(body.endDate, tz);
      if (!rawStart) return badRequest("A valid start date is required.");
      if (!rawEnd) return badRequest("A valid end date is required.");
      if (rawStart.getTime() > rawEnd.getTime()) return badRequest("Start date must be before end date.");

      // Clamp the admin range to the challenge's own start/end.
      effectiveStart = challengeStart && challengeStart.getTime() > rawStart.getTime() ? challengeStart : rawStart;
      effectiveEnd = challengeEnd && challengeEnd.getTime() < rawEnd.getTime() ? challengeEnd : rawEnd;
      if (effectiveEnd.getTime() > now.getTime()) effectiveEnd = now;
      if (effectiveStart.getTime() > effectiveEnd.getTime()) {
        return badRequest("The selected dates do not overlap the challenge's own start/end dates.");
      }
      if (rawStart.getTime() < effectiveStart.getTime() || rawEnd.getTime() > effectiveEnd.getTime()) {
        warnings.push("The date range was clamped to the challenge's own start/end dates.");
      }

      // Count whole weeks: widen the claim query to full week boundaries so a
      // range starting mid-week can't under-count, then only award weeks that
      // overlap the effective range.
      const weekStartsOn = window.weekStartsOn ?? 1;
      queryStart = startOfLocalWeekUtc(effectiveStart, tz, weekStartsOn);
      const lastWeekStart = startOfLocalWeekUtc(effectiveEnd, tz, weekStartsOn);
      const lastWeekEnd = new Date(lastWeekStart.getTime() + 7 * DAY_MS);
      queryEnd = lastWeekEnd.getTime() < now.getTime() ? lastWeekEnd : now;

      awardableWeeks = new Set<string>();
      for (let cursor = queryStart.getTime(); cursor < lastWeekEnd.getTime(); cursor += 7 * DAY_MS) {
        awardableWeeks.add(weekStartKey(new Date(cursor), tz, weekStartsOn));
      }
    }

    // ---- Aggregate claims into per-user period buckets (paginated) ----
    const maxScanCount = thresholds[thresholds.length - 1].scanCount;
    const buckets = new Map<string, { userId: string; periodKey: string; events: Set<string> | null; count: number }>();
    let claimsScanned = 0;
    const PAGE = 1000;
    let cursor: QueryDocumentSnapshot | null = null;
    for (;;) {
      let q = adminFirestore
        .collection("scan_event_claim_events")
        .where("createdAt", ">=", Timestamp.fromDate(queryStart))
        .where("createdAt", "<=", Timestamp.fromDate(queryEnd))
        .orderBy("createdAt", "asc")
        .limit(PAGE);
      if (cursor) q = q.startAfter(cursor);
      const page = await q.get();
      if (page.empty) break;
      for (const doc of page.docs) {
        const c = doc.data() as ClaimData;
        claimsScanned += 1;
        if (!c.userId || !c.createdAt?.toDate) continue;
        if (!scanMatchesScope(challenge.scope, c.scanEventId, c.association)) continue;
        const periodKey = periodKeyForClaim(window, c.createdAt.toDate());
        if (awardableWeeks && !awardableWeeks.has(periodKey)) continue;
        const key = `${c.userId}|${periodKey}`;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = {
            userId: c.userId,
            periodKey,
            events: countMode === "distinct_events" ? new Set() : null,
            count: 0,
          };
          buckets.set(key, bucket);
        }
        bucket.count += 1;
        if (bucket.events && c.scanEventId && bucket.events.size < maxScanCount) {
          bucket.events.add(c.scanEventId);
        }
      }
      cursor = page.docs[page.docs.length - 1];
      if (page.size < PAGE) break;
    }

    // ---- Build candidate entries from qualifying buckets ----
    const candidates: Array<{
      id: string;
      giveawayId: string;
      userId: string;
      periodKey: string;
      threshold: ScanChallengeThreshold;
    }> = [];
    const qualifiedUsers = new Set<string>();
    for (const bucket of buckets.values()) {
      const count = bucket.events ? bucket.events.size : bucket.count;
      const met = thresholds.filter((t) => count >= t.scanCount);
      if (met.length === 0) continue;
      qualifiedUsers.add(bucket.userId);
      for (const giveawayId of resolvedGiveawayIds) {
        for (const threshold of met) {
          candidates.push({
            id: challengeEntryId({
              giveawayId,
              challengeId,
              userId: bucket.userId,
              periodKey: bucket.periodKey,
              thresholdId: threshold.id,
            }),
            giveawayId,
            userId: bucket.userId,
            periodKey: bucket.periodKey,
            threshold,
          });
        }
      }
    }

    // ---- Existing entries: one query, not one read per candidate ----
    const existingIds = new Set<string>();
    const existingUserThresholdPeriods = new Map<string, Set<string>>();
    const existingSnap = await adminFirestore
      .collection("giveaway_entries")
      .where("scanChallengeId", "==", challengeId)
      .get();
    existingSnap.docs.forEach((doc) => {
      existingIds.add(doc.id);
      const data = doc.data() as {
        userId?: string;
        scanChallengeThresholdId?: string;
        scanChallengePeriodKey?: string;
      };
      if (data.userId && data.scanChallengeThresholdId) {
        const key = `${data.userId}|${data.scanChallengeThresholdId}`;
        if (!existingUserThresholdPeriods.has(key)) existingUserThresholdPeriods.set(key, new Set());
        if (data.scanChallengePeriodKey) existingUserThresholdPeriods.get(key)!.add(data.scanChallengePeriodKey);
      }
    });

    const missing = candidates.filter((c) => !existingIds.has(c.id));
    const alreadyExist = candidates.length - missing.length;

    // Same member + tier already awarded under a DIFFERENT period key (e.g. the
    // challenge's window type was edited after live awards ran) — surface it.
    let crossPeriodMembers = 0;
    const seenCross = new Set<string>();
    for (const cand of missing) {
      const key = `${cand.userId}|${cand.threshold.id}`;
      const periods = existingUserThresholdPeriods.get(key);
      if (periods && !periods.has(cand.periodKey) && !seenCross.has(key)) {
        seenCross.add(key);
        crossPeriodMembers += 1;
      }
    }
    if (crossPeriodMembers > 0) {
      warnings.push(
        `${crossPeriodMembers} member(s) already have entries for the same tier under a different period (likely awarded before the challenge's window settings changed). Committing will add further entries on top for those members.`,
      );
    }

    // ---- Commit (create, never overwrite: a concurrent live award wins) ----
    let entriesCreated = 0;
    let overwriteSkips = 0;
    if (mode === "commit" && missing.length > 0) {
      const nowTs = Timestamp.now();
      const entriesCol = adminFirestore.collection("giveaway_entries");
      const CHUNK = 200;
      for (let i = 0; i < missing.length; i += CHUNK) {
        const chunk = missing.slice(i, i + CHUNK);
        const batch = adminFirestore.batch();
        for (const cand of chunk) {
          batch.create(
            entriesCol.doc(cand.id),
            buildChallengeEntry({
              giveawayId: cand.giveawayId,
              userId: cand.userId,
              challengeId,
              threshold: cand.threshold,
              periodKey: cand.periodKey,
              now: nowTs,
              backfilled: true,
            }),
          );
        }
        try {
          await batch.commit();
          entriesCreated += chunk.length;
        } catch {
          // A doc in this chunk sprang into existence (live award raced us).
          // Fall back to per-doc creates so one conflict can't sink the chunk.
          const results = await Promise.allSettled(
            chunk.map((cand) =>
              entriesCol.doc(cand.id).create(
                buildChallengeEntry({
                  giveawayId: cand.giveawayId,
                  userId: cand.userId,
                  challengeId,
                  threshold: cand.threshold,
                  periodKey: cand.periodKey,
                  now: nowTs,
                  backfilled: true,
                }),
              ),
            ),
          );
          results.forEach((result) => {
            if (result.status === "fulfilled") entriesCreated += 1;
            else overwriteSkips += 1;
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      mode,
      windowType: window.type,
      countMode,
      claimsScanned,
      usersQualified: qualifiedUsers.size,
      giveawayCount: resolvedGiveawayIds.length,
      resolvedGiveawayIds,
      entriesAlreadyExist: alreadyExist + overwriteSkips,
      entriesToCreate: missing.length,
      entriesCreated,
      warnings,
      effectiveStart: effectiveStart.toISOString(),
      effectiveEnd: effectiveEnd.toISOString(),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to backfill scan challenge.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
