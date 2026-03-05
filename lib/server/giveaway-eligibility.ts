export type GiveawayScanSource = "in_person" | "remote";

export type GiveawayEligibility = {
  matchMode?: "all" | "any";
  causeIds?: string[];
  businessIds?: string[];
  locationIds?: string[];
  scanSources?: GiveawayScanSource[];
};

export type DonationEligibilityContext = {
  causeId?: string | null;
  businessId?: string | null;
  locationId?: string | null;
  scanSource?: string | null;
};

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(out));
}

function cleanSources(value: unknown): GiveawayScanSource[] {
  if (!Array.isArray(value)) return [];
  const out = value.filter((item): item is GiveawayScanSource => item === "in_person" || item === "remote");
  return Array.from(new Set(out));
}

export function normalizeGiveawayEligibility(value: unknown): GiveawayEligibility {
  if (!value || typeof value !== "object") {
    return { matchMode: "all", causeIds: [], businessIds: [], locationIds: [], scanSources: [] };
  }

  const record = value as Record<string, unknown>;
  const scanSources = cleanSources(record.scanSources);
  const includesRemote = scanSources.includes("remote");
  return {
    matchMode: record.matchMode === "any" ? "any" : "all",
    causeIds: cleanStringList(record.causeIds),
    // Remote support is never business/location scoped.
    businessIds: includesRemote ? [] : cleanStringList(record.businessIds),
    locationIds: includesRemote ? [] : cleanStringList(record.locationIds),
    scanSources,
  };
}

export function donationQualifiesForGiveaway(
  context: DonationEligibilityContext,
  eligibilityRaw: unknown,
): boolean {
  const eligibility = normalizeGiveawayEligibility(eligibilityRaw);
  const matches: boolean[] = [];

  if (eligibility.causeIds && eligibility.causeIds.length > 0) {
    matches.push(Boolean(context.causeId) && eligibility.causeIds.includes(String(context.causeId)));
  }
  if (eligibility.businessIds && eligibility.businessIds.length > 0) {
    matches.push(Boolean(context.businessId) && eligibility.businessIds.includes(String(context.businessId)));
  }
  if (eligibility.locationIds && eligibility.locationIds.length > 0) {
    matches.push(Boolean(context.locationId) && eligibility.locationIds.includes(String(context.locationId)));
  }
  if (eligibility.scanSources && eligibility.scanSources.length > 0) {
    const source = context.scanSource === "in_person" || context.scanSource === "remote" ? context.scanSource : null;
    matches.push(source ? eligibility.scanSources.includes(source) : false);
  }

  if (matches.length === 0) return true;
  if (eligibility.matchMode === "any") return matches.some(Boolean);
  return matches.every(Boolean);
}
