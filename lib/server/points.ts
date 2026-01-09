const POINTS_PER_DOLLAR = 100;
const MAX_POINTS_PER_DONATION = 10000;

export function calculatePointsFromCents(amountCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  const dollars = amountCents / 100;
  const points = Math.floor(dollars * POINTS_PER_DOLLAR);
  return Math.min(points, MAX_POINTS_PER_DONATION);
}

export function getPointsConfig() {
  return {
    pointsPerDollar: POINTS_PER_DOLLAR,
    maxPointsPerDonation: MAX_POINTS_PER_DONATION,
  };
}

export function normalizePointsOverride(value?: string | number | null) {
  if (value == null) return null;
  const num =
    typeof value === "string"
      ? Number.parseInt(value, 10)
      : typeof value === "number"
        ? value
        : NaN;
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}
