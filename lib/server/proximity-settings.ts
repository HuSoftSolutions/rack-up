import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { applyEnforcementCeiling } from "@/lib/server/scan-events";
import type { ResolvedProximityMode } from "@/lib/types/scan-event";

export { applyEnforcementCeiling };

/**
 * Site-wide ceiling on location enforcement, independent of per-event config.
 *
 * Per-event `proximity.mode` says what an event *wants*; this says the most any
 * event is allowed to do right now. It only ever loosens, never tightens, so a
 * single switch can stand the whole geofence down during an incident without
 * touching — or losing — how each event is configured.
 */
export type ProximityEnforcementLevel = ResolvedProximityMode;

export const SETTINGS_COLLECTION = "settings";
export const PROXIMITY_SETTINGS_DOC = "scan_proximity";

/** With no setting written, events govern themselves. */
export const DEFAULT_ENFORCEMENT_LEVEL: ProximityEnforcementLevel = "enforce";

export type ProximitySettings = {
  enforcement: ProximityEnforcementLevel;
  note: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export function normalizeEnforcementLevel(value: unknown): ProximityEnforcementLevel {
  if (value === "off") return "off";
  if (value === "log") return "log";
  if (value === "enforce") return "enforce";
  return DEFAULT_ENFORCEMENT_LEVEL;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

/**
 * Read the current ceiling.
 *
 * A read failure falls back to "enforce" — which applies no downgrade at all, so
 * per-event config keeps governing. The alternative (failing to "off") would let
 * a transient Firestore blip silently disable the geofence everywhere with
 * nothing in the admin UI to show it had happened.
 */
export async function loadProximityEnforcement(): Promise<ProximityEnforcementLevel> {
  try {
    const snap = await adminFirestore
      .collection(SETTINGS_COLLECTION)
      .doc(PROXIMITY_SETTINGS_DOC)
      .get();
    if (!snap.exists) return DEFAULT_ENFORCEMENT_LEVEL;
    return normalizeEnforcementLevel((snap.data() as { enforcement?: unknown }).enforcement);
  } catch {
    return DEFAULT_ENFORCEMENT_LEVEL;
  }
}

export async function loadProximitySettings(): Promise<ProximitySettings> {
  const snap = await adminFirestore
    .collection(SETTINGS_COLLECTION)
    .doc(PROXIMITY_SETTINGS_DOC)
    .get();
  const data = (snap.data() ?? {}) as {
    enforcement?: unknown;
    note?: unknown;
    updatedAt?: unknown;
    updatedBy?: unknown;
  };
  return {
    enforcement: snap.exists
      ? normalizeEnforcementLevel(data.enforcement)
      : DEFAULT_ENFORCEMENT_LEVEL,
    note: typeof data.note === "string" && data.note.trim() ? data.note.trim() : null,
    updatedAt: toIso(data.updatedAt),
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : null,
  };
}

export async function saveProximityEnforcement(
  enforcement: ProximityEnforcementLevel,
  updatedBy: string,
  note?: string | null,
): Promise<ProximitySettings> {
  await adminFirestore
    .collection(SETTINGS_COLLECTION)
    .doc(PROXIMITY_SETTINGS_DOC)
    .set(
      {
        enforcement,
        note: typeof note === "string" && note.trim() ? note.trim() : null,
        updatedBy,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
  return loadProximitySettings();
}
