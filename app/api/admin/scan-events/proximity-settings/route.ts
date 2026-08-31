import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import {
  loadProximitySettings,
  normalizeEnforcementLevel,
  saveProximityEnforcement,
} from "@/lib/server/proximity-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return NextResponse.json({ settings: await loadProximitySettings() });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to load location settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { uid } = await requireAdmin(request);

    let body: { enforcement?: unknown; note?: unknown };
    try {
      body = (await request.json()) as { enforcement?: unknown; note?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    // Reject unknown values rather than silently defaulting to "enforce" — a
    // typo here would turn the geofence back on for every event at once.
    if (body.enforcement !== "off" && body.enforcement !== "log" && body.enforcement !== "enforce") {
      return NextResponse.json(
        { error: 'enforcement must be one of "off", "log", or "enforce".' },
        { status: 400 },
      );
    }

    const settings = await saveProximityEnforcement(
      normalizeEnforcementLevel(body.enforcement),
      uid,
      typeof body.note === "string" ? body.note : null,
    );
    return NextResponse.json({ settings });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to save location settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
