import type { GiveawayScanSource } from "@/lib/server/giveaway-eligibility";

export type GiveawayEntryConfig = {
  entryUnitPoints: number;
  entryMultiplier: {
    inPerson: number;
    remote: number;
  };
};

const DEFAULT_ENTRY_UNIT_POINTS = 500;

function normalizePositiveInt(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const next = Math.floor(value);
  return next > 0 ? next : fallback;
}

export function normalizeGiveawayEntryConfig(value: unknown): GiveawayEntryConfig {
  if (!value || typeof value !== "object") {
    return {
      entryUnitPoints: DEFAULT_ENTRY_UNIT_POINTS,
      entryMultiplier: { inPerson: 1, remote: 1 },
    };
  }
  const record = value as Record<string, unknown>;
  const multiplierRaw =
    record.entryMultiplier && typeof record.entryMultiplier === "object"
      ? (record.entryMultiplier as Record<string, unknown>)
      : {};

  return {
    entryUnitPoints: normalizePositiveInt(record.entryUnitPoints, DEFAULT_ENTRY_UNIT_POINTS),
    entryMultiplier: {
      inPerson: normalizePositiveInt(multiplierRaw.inPerson, 1),
      remote: normalizePositiveInt(multiplierRaw.remote, 1),
    },
  };
}

export function getEntryMultiplier(config: GiveawayEntryConfig, scanSource: string | null | undefined) {
  const source: GiveawayScanSource = scanSource === "in_person" ? "in_person" : "remote";
  return source === "in_person" ? config.entryMultiplier.inPerson : config.entryMultiplier.remote;
}

export function getDefaultEntryUnitPoints() {
  return DEFAULT_ENTRY_UNIT_POINTS;
}
