export type ScanEventAssociationType =
  | "standalone"
  | "charity"
  | "business_location"
  | "custom";

export type ScanEventCadenceUnit = "hours" | "days" | "weeks";

export type ScanEventAssociation = {
  type: ScanEventAssociationType;
  causeId?: string | null;
  businessId?: string | null;
  locationId?: string | null;
  customLabel?: string | null;
};

export type ScanEventCadence = {
  unit: ScanEventCadenceUnit;
  interval: number;
};

export type ScanEventRewards = {
  points: {
    enabled: boolean;
    amount: number;
  };
  giveaway: {
    enabled: boolean;
    targetMode: "selected" | "all_active";
    giveawayIds: string[];
    entries: number;
  };
};

/**
 * Proximity enforcement for a scan event.
 * - "auto":    the default. Enforces whenever the event has coordinates, and is
 *              inert when it does not, so filling in an address is the only step
 *              needed to protect a location.
 * - "off":     explicit opt-out, even when coordinates exist.
 * - "log":     capture the result on the claim record but never block.
 * - "enforce": always enforce (identical to "auto" once coordinates exist).
 */
export type ScanEventProximityMode = "auto" | "off" | "log" | "enforce";

/** Mode after applying the "auto" default. What the claim path actually acts on. */
export type ResolvedProximityMode = "off" | "log" | "enforce";

export type ScanEventProximity = {
  mode: ScanEventProximityMode;
  radiusMeters: number;
};

export type ScanEventLocation = {
  address: string;
  lat: number;
  lng: number;
  placeId?: string | null;
};

export type ScanEventDoc = {
  title: string;
  description?: string | null;
  active: boolean;
  /** Physical place where this scan event lives, used for the public map + directory. */
  place?: ScanEventLocation | null;
  /** Location gating. Absent on legacy docs, which are treated as mode "off". */
  proximity?: ScanEventProximity | null;
  association: ScanEventAssociation;
  cadence: ScanEventCadence;
  rewards: ScanEventRewards;
  imageUrl?: string | null;
  imagePath?: string | null;
  createdAt: import("firebase-admin/firestore").Timestamp;
  updatedAt?: import("firebase-admin/firestore").Timestamp;
};

export type PublicScanEvent = {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string | null;
  cadence: ScanEventCadence;
  rewards: ScanEventRewards;
  association: ScanEventAssociation;
  place?: ScanEventLocation | null;
  /** Already resolved, so the client never has to interpret "auto". */
  proximity?: { mode: ResolvedProximityMode; radiusMeters: number } | null;
};
