export type BusinessType = "gym" | "partner";

export type BusinessDoc = {
  name: string;
  description?: string;
  slug: string;
  type?: BusinessType;
  logoPath?: string;
  logoUrl?: string;
  active: boolean;
  createdAt: FirebaseTimestamp;
  updatedAt?: FirebaseTimestamp;
};

export type LocationDoc = {
  businessId: string;
  name: string;
  slug: string;
  address?: string;
  logoPath?: string;
  logoUrl?: string;
  active: boolean;
  createdAt: FirebaseTimestamp;
  updatedAt?: FirebaseTimestamp;
};

export type CauseDoc = {
  businessId: string;
  title: string;
  slug: string;
  description?: string;
  mode: "custom" | "predefined";
  pointsPerDollar?: number;
  predefinedOptions?: { amountCents: number; points: number; label?: string }[];
  pointsConfig?: {
    inPerson?: {
      mode: "custom" | "predefined";
      pointsPerDollar?: number;
      predefinedOptions?: { amountCents: number; points: number; label?: string }[];
    };
    remote?: {
      mode: "custom" | "predefined";
      pointsPerDollar?: number;
      predefinedOptions?: { amountCents: number; points: number; label?: string }[];
    };
  };
  minAmountCents?: number;
  maxAmountCents?: number;
  imageUrl?: string;
  locationIds?: string[]; // allowed location slugs/ids for this cause
  active: boolean;
  createdAt: FirebaseTimestamp;
  updatedAt?: FirebaseTimestamp;
};

export type FirebaseTimestamp =
  | import("firebase/firestore").Timestamp
  | import("firebase-admin/firestore").Timestamp
  | import("firebase/firestore").FieldValue;
