export type PlatformNotificationDoc = {
  title: string;
  description: string;
  color: "amber" | "emerald" | "blue" | "red" | "zinc";
  active: boolean;
  createdAt: import("firebase-admin/firestore").Timestamp;
  updatedAt?: import("firebase-admin/firestore").Timestamp;
};
