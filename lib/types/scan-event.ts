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

export type ScanEventDoc = {
  title: string;
  description?: string | null;
  active: boolean;
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
};
