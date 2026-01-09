import type { Timestamp } from "firebase/firestore";

export type FirestoreTimestamp =
  | Timestamp
  | import("firebase-admin/firestore").Timestamp;

export type PointsTransactionType = "donation" | "redemption";

export type TransactionStatus = "pending" | "completed" | "failed";

export type PointsTransaction = {
  userId: string;
  type: PointsTransactionType;
  pointsDelta: number;
  amountCents?: number;
  businessId?: string;
  dealId?: string;
  stripePaymentIntentId?: string;
  status: TransactionStatus;
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
};

export type UserProfile = {
  email?: string;
  phoneNumber?: string;
  displayName?: string;
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
};

export type Business = {
  name: string;
  active: boolean;
  logoPath?: string; // Firebase Storage path
  locations: LocationInfo[];
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
};

export type LocationInfo = {
  label: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  notes?: string;
};

export type DealType = "percent_off" | "amount_off" | "bogo" | "free_item";

export type Deal = {
  businessId: string;
  title: string;
  description?: string;
  type: DealType;
  terms?: string;
  pointCost: number;
  active: boolean;
  heroImagePath?: string; // Firebase Storage path
  locations: LocationInfo[];
  createdAt: Timestamp;
  updatedAt?: Timestamp;
};

export type RewardStatus = "issued" | "used" | "expired";

export type RewardIssue = {
  userId: string;
  businessId: string;
  dealId: string;
  code: string;
  status: RewardStatus;
  issuedAt: FirestoreTimestamp;
  expiresAt: FirestoreTimestamp;
  usedAt?: FirestoreTimestamp;
  displayPayload: RewardDisplayPayload;
};

export type RewardDisplayPayload = {
  title: string;
  businessName: string;
  dealType: DealType;
  terms?: string;
  logoUrl?: string;
  locations?: LocationInfo[];
  expiresAt: string; // ISO string for rendering without Timestamp parsing client-side
  code: string;
};

export type PointsConfig = {
  pointsPerDollar: number;
  maxPointsPerDonation?: number;
  updatedAt: FirestoreTimestamp;
};

export type BusinessAdminMembership = {
  businessId: string;
  role: "owner" | "staff";
};
