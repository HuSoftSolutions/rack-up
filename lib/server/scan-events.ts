import crypto from "crypto";
import type {
  PublicScanEvent,
  ScanEventAssociation,
  ScanEventAssociationType,
  ScanEventCadence,
  ScanEventCadenceUnit,
  ScanEventDoc,
  ScanEventLocation,
  ResolvedProximityMode,
  ScanEventProximity,
  ScanEventProximityMode,
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

function asFiniteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
}

function normalizePlace(value: unknown): ScanEventLocation | null {
  const record = parseRecord(value);
  const address = asString(record.address);
  const lat = asFiniteNumber(record.lat);
  const lng = asFiniteNumber(record.lng);
  // Require a full address + valid coordinates; anything partial is treated as "no place".
  if (!address || lat === undefined || lng === undefined) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    address,
    lat,
    lng,
    placeId: asString(record.placeId) ?? null,
  };
}

function normalizeProximityMode(value: unknown): ScanEventProximityMode {
  if (value === "log") return "log";
  if (value === "enforce") return "enforce";
  if (value === "off") return "off";
  return "auto";
}

/**
 * Applies the "auto" default: an event with usable coordinates enforces, and one
 * without is inert. Coordinates are the switch — there is nothing to turn on.
 */
export function resolveProximityMode(
  place: { lat?: unknown; lng?: unknown } | null | undefined,
  proximity: { mode?: unknown } | null | undefined,
): ResolvedProximityMode {
  const hasCoords =
    Boolean(place) &&
    Number.isFinite(Number(place?.lat)) &&
    Number.isFinite(Number(place?.lng));
  if (!hasCoords) return "off";
  const mode = normalizeProximityMode(proximity?.mode);
  return mode === "auto" ? "enforce" : mode;
}

/**
 * Clamp an event's own resolved mode to a site-wide ceiling. Downgrades only:
 * "off" silences everything, "log" lets checks run and be recorded but never
 * block a claim, "enforce" leaves the event's own setting alone.
 *
 * Pure by design — this module is reachable from client components, so the
 * Firestore-backed setting that supplies the ceiling lives in proximity-settings.
 */
export function applyEnforcementCeiling(
  mode: ResolvedProximityMode,
  ceiling: ResolvedProximityMode,
): ResolvedProximityMode {
  if (ceiling === "off") return "off";
  if (ceiling === "log") return mode === "off" ? "off" : "log";
  return mode;
}

/**
 * Default geofence radius. Generous on purpose: GPS indoors routinely drifts
 * 50-100m, and a POI pin is often set at a storefront while members claim from
 * the parking lot. Sites on a large shared parcel (a strip mall, a plaza) need
 * a per-event override on top of this.
 */
export const DEFAULT_PROXIMITY_RADIUS_METERS = 150;
const MIN_PROXIMITY_RADIUS_METERS = 25;
const MAX_PROXIMITY_RADIUS_METERS = 5000;

/**
 * Extra slack granted from the device's own reported accuracy, so a phone with a
 * weak fix is not punished. Capped so a coarse IP-derived fix (often several km)
 * cannot buy its way inside the radius.
 */
export const MAX_ACCURACY_SLACK_METERS = 100;

/**
 * How long a verified location stays good for. Covers signing in or reading the
 * page before tapping claim; far too short to leave and still claim.
 */
export const LOCATION_GRANT_TTL_MS = 5 * 60 * 1000;

function normalizeProximity(value: unknown): ScanEventProximity {
  const record = parseRecord(value);
  return {
    mode: normalizeProximityMode(record.mode),
    radiusMeters: asPositiveInt(
      record.radiusMeters,
      DEFAULT_PROXIMITY_RADIUS_METERS,
      MIN_PROXIMITY_RADIUS_METERS,
      MAX_PROXIMITY_RADIUS_METERS,
    ),
  };
}

const EARTH_RADIUS_METERS = 6_371_000;

/** Great-circle distance in meters between two lat/lng pairs. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type ProximityCoords = { lat: number; lng: number; accuracy?: number };

export type ProximityEvaluation = {
  distanceMeters: number;
  accuracyMeters: number | null;
  allowanceMeters: number;
  withinRadius: boolean;
};

/**
 * Compare a device fix against an event's place. The device's own reported
 * accuracy widens the allowance (capped), so a weak fix is forgiven but a coarse
 * IP-derived fix cannot buy its way inside.
 */
export function evaluateProximity(
  place: { lat: number; lng: number },
  radiusMeters: number,
  coords: ProximityCoords,
): ProximityEvaluation {
  const distanceMeters = haversineMeters(coords, place);
  const accuracyMeters =
    typeof coords.accuracy === "number" && Number.isFinite(coords.accuracy) ? coords.accuracy : null;
  const allowanceMeters = radiusMeters + Math.min(accuracyMeters ?? 0, MAX_ACCURACY_SLACK_METERS);
  return {
    distanceMeters,
    accuracyMeters,
    allowanceMeters,
    withinRadius: distanceMeters <= allowanceMeters,
  };
}

export function normalizeProximityCoords(value: unknown): ProximityCoords | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const lat = Number(record.lat);
  const lng = Number(record.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const accuracyRaw = Number(record.accuracy);
  const accuracy = Number.isFinite(accuracyRaw) && accuracyRaw >= 0 ? accuracyRaw : undefined;
  return { lat, lng, accuracy };
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

  const place = normalizePlace(record.place);
  const proximity = normalizeProximity(record.proximity);
  // "auto" is inert without coordinates by design; an explicit mode is not, and
  // would silently never match, so refuse that misconfiguration.
  if ((proximity.mode === "log" || proximity.mode === "enforce") && !place) {
    throw new Error("Set a scan location before enabling location checking.");
  }

  return {
    title,
    description: asString(record.description) ?? null,
    active: asBoolean(record.active, true),
    place,
    proximity,
    association,
    cadence,
    rewards,
    imageUrl: asString(record.imageUrl) ?? null,
    imagePath: asString(record.imagePath) ?? null,
  };
}

export function mapScanEventDocToPublic(
  id: string,
  data: ScanEventDoc,
  /** Site-wide ceiling; callers pass the current setting so the claim page and
   * the claim endpoint agree on whether location is required. */
  enforcementCeiling: ResolvedProximityMode = "enforce",
): PublicScanEvent {
  return {
    id,
    title: data.title,
    description: data.description ?? undefined,
    imageUrl: data.imageUrl ?? null,
    cadence: data.cadence,
    rewards: data.rewards,
    association: data.association,
    place: data.place ?? null,
    proximity: {
      mode: applyEnforcementCeiling(
        resolveProximityMode(data.place, data.proximity),
        enforcementCeiling,
      ),
      radiusMeters: Math.max(
        1,
        Math.floor(data.proximity?.radiusMeters ?? DEFAULT_PROXIMITY_RADIUS_METERS),
      ),
    },
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

type LocationGrantPayload = {
  v: 1;
  eventId: string;
  uid: string;
  /** Expiry, epoch ms. */
  exp: number;
  /** Recorded distance in meters, for the audit trail. */
  d: number;
};

export type LocationGrantVerifyResult =
  | { ok: true; distanceMeters: number }
  | { ok: false; reason: "missing" | "malformed" | "invalid_signature" | "expired" | "mismatch" };

/**
 * Mints a short-lived, signed proof that a specific user was verified inside a
 * specific event's geofence. The claim endpoint trusts this rather than trusting
 * coordinates in the request body, so a page cannot replay a stale fix later.
 */
export function createLocationGrant(eventId: string, uid: string, distanceMeters: number): string {
  const payload: LocationGrantPayload = {
    v: 1,
    eventId,
    uid,
    exp: Date.now() + LOCATION_GRANT_TTL_MS,
    d: Math.round(distanceMeters),
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function verifyLocationGrant(
  grant: string | null | undefined,
  eventId: string,
  uid: string,
): LocationGrantVerifyResult {
  if (!grant) return { ok: false, reason: "missing" };
  const [encoded, signature] = grant.split(".");
  if (!encoded || !signature) return { ok: false, reason: "malformed" };
  if (!timingSafeEqual(signature, sign(encoded))) return { ok: false, reason: "invalid_signature" };
  try {
    const parsed = JSON.parse(base64UrlDecode(encoded).toString("utf8")) as LocationGrantPayload;
    if (!parsed || parsed.v !== 1) return { ok: false, reason: "malformed" };
    if (parsed.eventId !== eventId || parsed.uid !== uid) return { ok: false, reason: "mismatch" };
    if (!Number.isFinite(parsed.exp) || parsed.exp < Date.now()) return { ok: false, reason: "expired" };
    return { ok: true, distanceMeters: Number.isFinite(parsed.d) ? parsed.d : 0 };
  } catch {
    return { ok: false, reason: "malformed" };
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
