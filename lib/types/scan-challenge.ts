import type { Timestamp } from "firebase-admin/firestore";

export type ScanChallengeWindowType = "calendar_week" | "rolling_days";
export type ScanChallengeCountMode = "claims" | "distinct_events";
export type ScanChallengeMatchMode = "any" | "all";
export type ScanChallengeGiveawayTargetMode = "selected" | "all_active";

export type ScanChallengeWindow = {
  type: ScanChallengeWindowType;
  timezone: string;
  /** calendar_week only: 1 = Monday (ISO) .. 7 = Sunday. */
  weekStartsOn?: number;
  /** rolling_days only: size of the rolling window. */
  days?: number;
};

export type ScanChallengeScope = {
  matchMode: ScanChallengeMatchMode;
  businessIds: string[];
  causeIds: string[];
  locationIds: string[];
  scanEventIds: string[];
};

export type ScanChallengeThreshold = {
  id: string;
  scanCount: number;
  /** Marginal entries granted when this rung is first reached. */
  entries: number;
};

export type ScanChallengeGiveaway = {
  targetMode: ScanChallengeGiveawayTargetMode;
  giveawayIds: string[];
};

export type ScanChallengeDoc = {
  title: string;
  active: boolean;
  window: ScanChallengeWindow;
  scope: ScanChallengeScope;
  countMode: ScanChallengeCountMode;
  thresholds: ScanChallengeThreshold[];
  giveaway: ScanChallengeGiveaway;
  startsAt?: Timestamp | null;
  endsAt?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
};
