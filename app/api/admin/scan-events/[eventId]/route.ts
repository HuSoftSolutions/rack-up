import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import { normalizeScanEventInput } from "@/lib/server/scan-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function PATCH(request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    await requireAdmin(request);
    const { eventId } = await context.params;
    if (!eventId) return badRequest("eventId is required.");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body.");
    }
    const normalized = normalizeScanEventInput(body);
    await adminFirestore
      .collection("scan_events")
      .doc(eventId)
      .set(
        {
          ...normalized,
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to update scan event.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
