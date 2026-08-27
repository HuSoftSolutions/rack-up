import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/lib/server/auth";
import {
  DEFAULT_PROXIMITY_RADIUS_METERS,
  LOCATION_GRANT_TTL_MS,
  createLocationGrant,
  evaluateProximity,
  inspectScanEventToken,
  normalizeProximityCoords,
  resolveProximityMode,
} from "@/lib/server/scan-events";
import type { ScanEventDoc } from "@/lib/types/scan-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Confirms the signed-in user is standing inside a scan event's geofence and, if
 * so, returns a short-lived signed grant. The claim endpoint requires that grant
 * instead of trusting coordinates, so a verified page cannot be replayed later.
 */
export async function POST(request: Request) {
  try {
    const { uid } = await requireUser(request);

    let body: { token?: string; coords?: unknown };
    try {
      body = (await request.json()) as { token?: string; coords?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const inspected = inspectScanEventToken(body.token?.trim());
    if (!inspected.ok) {
      return NextResponse.json({ error: `Invalid scan token (${inspected.reason}).` }, { status: 400 });
    }

    const coords = normalizeProximityCoords(body.coords);
    if (!coords) {
      return NextResponse.json({ error: "Valid coords are required." }, { status: 400 });
    }

    const eventSnap = await adminFirestore.collection("scan_events").doc(inspected.eventId).get();
    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Scan event not found." }, { status: 404 });
    }
    const event = eventSnap.data() as ScanEventDoc;

    const place = event.place ?? null;
    const mode = resolveProximityMode(place, event.proximity);
    const radiusMeters =
      Math.max(1, Math.floor(event.proximity?.radiusMeters ?? DEFAULT_PROXIMITY_RADIUS_METERS)) ||
      DEFAULT_PROXIMITY_RADIUS_METERS;

    // Nothing to verify: the claim endpoint will not require a grant either.
    if (mode === "off" || !place) {
      return NextResponse.json({ required: false, withinRadius: null, grant: null });
    }

    const evaluation = evaluateProximity(place, radiusMeters, coords);
    if (!evaluation.withinRadius) {
      return NextResponse.json({
        required: mode === "enforce",
        withinRadius: false,
        grant: null,
        distanceMeters: Math.round(evaluation.distanceMeters),
        radiusMeters,
      });
    }

    return NextResponse.json({
      required: mode === "enforce",
      withinRadius: true,
      grant: createLocationGrant(inspected.eventId, uid, evaluation.distanceMeters),
      distanceMeters: Math.round(evaluation.distanceMeters),
      radiusMeters,
      expiresInMs: LOCATION_GRANT_TTL_MS,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Failed to verify location.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
