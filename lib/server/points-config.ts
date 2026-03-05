import type { CauseDoc } from "@/lib/types/business";

export type PointsMode = "custom" | "predefined";

export type PointsConfig = {
  mode: PointsMode;
  pointsPerDollar?: number;
  predefinedOptions?: { amountCents: number; points: number; label?: string }[];
};

export type ScanSource = "in_person" | "remote";

export function resolvePointsConfig(
  cause: CauseDoc,
  source: ScanSource,
): PointsConfig {
  const inPersonOverride = cause.pointsConfig?.inPerson;
  const inPersonConfig: PointsConfig = inPersonOverride?.mode
    ? {
        mode: inPersonOverride.mode,
        pointsPerDollar: inPersonOverride.pointsPerDollar,
        predefinedOptions: inPersonOverride.predefinedOptions,
      }
    : {
        mode: cause.mode,
        pointsPerDollar: cause.pointsPerDollar,
        predefinedOptions: cause.predefinedOptions,
      };

  if (source === "remote") {
    const remoteOverride = cause.pointsConfig?.remote;
    if (remoteOverride && remoteOverride.mode) {
      return {
        mode: remoteOverride.mode,
        pointsPerDollar: remoteOverride.pointsPerDollar,
        predefinedOptions: remoteOverride.predefinedOptions,
      };
    }
    // Fallback to in-person config if remote isn't set (backward compat).
    return inPersonConfig;
  }

  return inPersonConfig;
}

export function calculatePointsFromConfig(
  amountCents: number,
  config: PointsConfig,
): { points: number; matchedOption?: { amountCents: number; points: number } } {
  if (config.mode === "predefined") {
    const options = config.predefinedOptions ?? [];
    const match = options.find((opt) => opt.amountCents === amountCents);
    return { points: match?.points ?? 0, matchedOption: match ? { amountCents, points: match.points } : undefined };
  }
  const dollars = amountCents / 100;
  const rate = typeof config.pointsPerDollar === "number" ? config.pointsPerDollar : 0;
  return { points: Math.max(0, Math.floor(dollars * rate)) };
}
