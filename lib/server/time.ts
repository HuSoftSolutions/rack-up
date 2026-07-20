/**
 * Timezone-aware date helpers shared by scan-driven features (same-day bonus,
 * weekly scan challenges). All functions treat "a day" / "a week" as local
 * calendar concepts in the given IANA timezone, then return UTC instants so
 * they can be compared against Firestore Timestamps.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

/** Local calendar date as "YYYY-MM-DD" in the given timezone. */
export function localDateKey(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

/** Milliseconds between the given instant and how the local wall clock reads it. */
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

/**
 * Interpret a naive "YYYY-MM-DDTHH:mm" wall-clock string (e.g. from an
 * <input type="datetime-local">) as a time in the given IANA timezone and
 * return the corresponding UTC instant. Returns null if the string doesn't
 * match the expected shape. A second refinement pass handles DST edges.
 */
export function zonedDateTimeToUtc(localValue: string, timezone: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(localValue.trim());
  if (!match) return null;
  const naiveUtc = new Date(`${match[1]}T${match[2]}:00Z`);
  if (Number.isNaN(naiveUtc.getTime())) return null;
  let result = new Date(naiveUtc.getTime() - timezoneOffsetMs(naiveUtc, timezone));
  result = new Date(naiveUtc.getTime() - timezoneOffsetMs(result, timezone));
  return result;
}

/** UTC instant of local midnight for the day the given instant falls in. */
export function startOfLocalDayUtc(date: Date, timezone: string): Date {
  const dateKey = localDateKey(date, timezone);
  const offsetMs = timezoneOffsetMs(date, timezone);
  const midnightAsUtc = new Date(`${dateKey}T00:00:00Z`).getTime();
  return new Date(midnightAsUtc - offsetMs);
}

/** UTC instant of local midnight for an explicit "YYYY-MM-DD" calendar key. */
function startOfLocalDayUtcForKey(dateKey: string, timezone: string): Date {
  // Noon UTC lands on the same calendar day in every timezone, so it resolves
  // back to `dateKey`'s local midnight regardless of the zone's offset.
  const noon = new Date(`${dateKey}T12:00:00Z`);
  return startOfLocalDayUtc(noon, timezone);
}

/**
 * Start of the local week (UTC instant) for the week the given instant falls in.
 * `weekStartsOn` is 1 = Monday (ISO) through 7 = Sunday.
 */
export function startOfLocalWeekUtc(
  date: Date,
  timezone: string,
  weekStartsOn = 1,
): Date {
  return startOfLocalDayUtcForKey(weekStartKey(date, timezone, weekStartsOn), timezone);
}

/**
 * Stable string key for the local week, e.g. "2026-06-29" (the Monday date).
 * Useful for idempotent per-week document IDs.
 */
export function weekStartKey(date: Date, timezone: string, weekStartsOn = 1): string {
  const todayKey = localDateKey(date, timezone);
  // getUTCDay on a pure calendar date (midnight Z) yields that date's weekday,
  // 0 = Sunday .. 6 = Saturday — a calendar fact independent of any timezone.
  const dow = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
  const start = ((weekStartsOn % 7) + 7) % 7; // 1..7 -> 1..6,0
  const daysBack = (dow - start + 7) % 7;
  const cursor = new Date(`${todayKey}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() - daysBack);
  return cursor.toISOString().slice(0, 10);
}

export { DAY_MS };
