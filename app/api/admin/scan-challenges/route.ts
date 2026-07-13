import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import { normalizeScanChallengeInput } from "@/lib/server/scan-challenges";
import type { ScanChallengeDoc } from "@/lib/types/scan-challenge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === "object" && value !== null && "_seconds" in value) {
    const ts = value as { _seconds: number; _nanoseconds?: number };
    return new Date(ts._seconds * 1000 + Math.floor((ts._nanoseconds ?? 0) / 1_000_000)).toISOString();
  }
  return null;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const [challengesSnap, giveawaysSnap] = await Promise.all([
      adminFirestore.collection("scan_challenges").orderBy("createdAt", "desc").get(),
      adminFirestore.collection("giveaways").where("status", "in", ["draft", "active"]).get(),
    ]);

    const challenges = challengesSnap.docs.map((doc) => {
      const data = doc.data() as ScanChallengeDoc;
      return {
        id: doc.id,
        title: data.title,
        active: data.active !== false,
        window: data.window,
        scope: data.scope,
        countMode: data.countMode,
        thresholds: data.thresholds,
        giveaway: data.giveaway,
        startsAt: toIso(data.startsAt),
        endsAt: toIso(data.endsAt),
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });

    const giveaways = giveawaysSnap.docs.map((doc) => {
      const data = doc.data() as { title?: string; status?: string };
      return { id: doc.id, title: data.title ?? doc.id, status: data.status ?? "draft" };
    });

    return NextResponse.json({ challenges, giveaways });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to load scan challenges.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const normalized = normalizeScanChallengeInput(body);
    const now = Timestamp.now();
    const ref = adminFirestore.collection("scan_challenges").doc();
    await ref.set({
      ...normalized,
      createdAt: now,
      updatedAt: now,
    } satisfies ScanChallengeDoc);

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to create scan challenge.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) return badRequest("A challenge id is required.");

    const ref = adminFirestore.collection("scan_challenges").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Scan challenge not found." }, { status: 404 });
    }

    const now = Timestamp.now();

    // Lightweight toggle: `{ id, active }` flips activation without a full re-validate.
    if (Object.keys(record).length <= 2 && typeof record.active === "boolean") {
      await ref.set({ active: record.active, updatedAt: now }, { merge: true });
      return NextResponse.json({ ok: true, id });
    }

    const normalized = normalizeScanChallengeInput({ ...snap.data(), ...record });
    await ref.set({ ...normalized, updatedAt: now }, { merge: true });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to update scan challenge.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    let id = url.searchParams.get("id")?.trim() ?? "";
    if (!id) {
      const body = (await request.json().catch(() => ({}))) as { id?: unknown };
      id = typeof body.id === "string" ? body.id.trim() : "";
    }
    if (!id) return badRequest("A challenge id is required.");

    await adminFirestore.collection("scan_challenges").doc(id).delete();
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to delete scan challenge.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
