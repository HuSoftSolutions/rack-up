import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { inspectScanEventToken, mapScanEventDocToPublic } from "@/lib/server/scan-events";
import { loadProximityEnforcement } from "@/lib/server/proximity-settings";
import type { ScanEventDoc } from "@/lib/types/scan-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const inspected = inspectScanEventToken(token);
  if (!inspected.ok) {
    return NextResponse.json({ error: `Invalid scan token (${inspected.reason}).` }, { status: 400 });
  }
  const snap = await adminFirestore.collection("scan_events").doc(inspected.eventId).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Scan event not found." }, { status: 404 });
  }
  const data = snap.data() as ScanEventDoc;
  if (data.active === false) {
    return NextResponse.json({ error: "This scan event is currently inactive." }, { status: 410 });
  }
  return NextResponse.json({
    event: mapScanEventDocToPublic(snap.id, data, await loadProximityEnforcement()),
  });
}
