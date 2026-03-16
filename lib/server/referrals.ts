import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";

export type ReferralConfig = {
  enabled: boolean;
  inviterPoints: number;
  invitedPoints: number;
  updatedAt?: Timestamp;
};

const DEFAULT_CONFIG: ReferralConfig = {
  enabled: false,
  inviterPoints: 0,
  invitedPoints: 0,
};

function asBool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asInt(value: unknown, fallback = 0, min = 0, max = 1_000_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function normalizeReferralConfig(value: unknown): ReferralConfig {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    enabled: asBool(record.enabled, DEFAULT_CONFIG.enabled),
    inviterPoints: asInt(record.inviterPoints, DEFAULT_CONFIG.inviterPoints),
    invitedPoints: asInt(record.invitedPoints, DEFAULT_CONFIG.invitedPoints),
  };
}

export async function getReferralConfig(): Promise<ReferralConfig> {
  const snap = await adminFirestore.collection("platform_config").doc("referrals").get();
  if (!snap.exists) return DEFAULT_CONFIG;
  return normalizeReferralConfig(snap.data());
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 8) {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export async function createUniqueReferralCode(maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const code = randomCode(8);
    const ref = adminFirestore.collection("referral_invites").doc(code);
    const snap = await ref.get();
    if (!snap.exists) return code;
  }
  throw new Error("Unable to allocate referral code.");
}
