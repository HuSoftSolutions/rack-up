import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import { normalizeGiveawayEligibility } from "@/lib/server/giveaway-eligibility";
import { normalizeGiveawayEntryConfig } from "@/lib/server/giveaway-entry-config";

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

function normalizePrize(value: unknown): {
  name: string;
  value?: string;
  imageUrl?: string;
  description?: string;
} | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!name) return null;
  const prize = {
    name,
    ...(typeof record.value === "string" && record.value.trim() ? { value: record.value.trim() } : {}),
    ...(typeof record.imageUrl === "string" && record.imageUrl.trim()
      ? { imageUrl: record.imageUrl.trim() }
      : {}),
    ...(typeof record.description === "string" && record.description.trim()
      ? { description: record.description.trim() }
      : {}),
  };
  return prize;
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const snapshot = await adminFirestore
      .collection("giveaways")
      .orderBy("createdAt", "desc")
      .get();
    const giveaways = snapshot.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const winnerRaw =
        data.winner && typeof data.winner === "object"
          ? (data.winner as Record<string, unknown>)
          : null;
      return {
        id: doc.id,
        ...data,
        winner: winnerRaw
          ? {
              ...winnerRaw,
              drawnAt: toIso(winnerRaw.drawnAt),
            }
          : null,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
        startsAt: toIso(data.startsAt),
        endsAt: toIso(data.endsAt),
        eligibility: normalizeGiveawayEligibility(data.eligibility),
        entryConfig: normalizeGiveawayEntryConfig(data.entryConfig),
        prize: normalizePrize(data.prize),
      };
    });
    return NextResponse.json({ giveaways });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to load giveaways." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = (await request.json()) as {
      title?: string;
      description?: string;
      status?: "draft" | "active" | "closed" | "drawn";
      startsAt?: string | null;
      endsAt?: string | null;
      eligibility?: unknown;
      entryConfig?: unknown;
      prize?: unknown;
    };
    if (!body.title?.trim()) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }
    const now = Timestamp.now();
    const ref = adminFirestore.collection("giveaways").doc();
    await ref.set({
      title: body.title.trim(),
      description: body.description ?? "",
      status: body.status ?? "draft",
      startsAt: body.startsAt ? Timestamp.fromDate(new Date(body.startsAt)) : null,
      endsAt: body.endsAt ? Timestamp.fromDate(new Date(body.endsAt)) : null,
      eligibility: normalizeGiveawayEligibility(body.eligibility),
      entryConfig: normalizeGiveawayEntryConfig(body.entryConfig),
      prize: normalizePrize(body.prize),
      scope: "global",
      createdAt: now,
      updatedAt: now,
    });
    await adminFirestore.collection("giveaway_events").add({
      giveawayId: ref.id,
      type: "created",
      actorUserId: admin.uid,
      at: now,
      payload: {
        title: body.title.trim(),
        status: body.status ?? "draft",
        startsAt: body.startsAt ? Timestamp.fromDate(new Date(body.startsAt)) : null,
        endsAt: body.endsAt ? Timestamp.fromDate(new Date(body.endsAt)) : null,
        eligibility: normalizeGiveawayEligibility(body.eligibility),
        entryConfig: normalizeGiveawayEntryConfig(body.entryConfig),
        prize: normalizePrize(body.prize),
      },
    });
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to create giveaway." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = (await request.json()) as {
      id?: string;
      title?: string;
      description?: string;
      status?: "draft" | "active" | "closed" | "drawn";
      startsAt?: string | null;
      endsAt?: string | null;
      eligibility?: unknown;
      entryConfig?: unknown;
      prize?: unknown;
    };
    const id = body.id?.trim();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const ref = adminFirestore.collection("giveaways").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Giveaway not found." }, { status: 404 });
    await ref.set(
      {
        ...(body.title ? { title: body.title.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(body.startsAt !== undefined
          ? { startsAt: body.startsAt ? Timestamp.fromDate(new Date(body.startsAt)) : null }
          : {}),
        ...(body.endsAt !== undefined
          ? { endsAt: body.endsAt ? Timestamp.fromDate(new Date(body.endsAt)) : null }
          : {}),
        ...(body.eligibility !== undefined
          ? { eligibility: normalizeGiveawayEligibility(body.eligibility) }
          : {}),
        ...(body.entryConfig !== undefined
          ? { entryConfig: normalizeGiveawayEntryConfig(body.entryConfig) }
          : {}),
        ...(body.prize !== undefined ? { prize: normalizePrize(body.prize) } : {}),
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
    await adminFirestore.collection("giveaway_events").add({
      giveawayId: id,
      type: "updated",
      actorUserId: admin.uid,
      at: Timestamp.now(),
      payload: {
        ...(body.title ? { title: body.title.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(body.startsAt !== undefined ? { startsAt: body.startsAt } : {}),
        ...(body.endsAt !== undefined ? { endsAt: body.endsAt } : {}),
        ...(body.eligibility !== undefined
          ? { eligibility: normalizeGiveawayEligibility(body.eligibility) }
          : {}),
        ...(body.entryConfig !== undefined
          ? { entryConfig: normalizeGiveawayEntryConfig(body.entryConfig) }
          : {}),
        ...(body.prize !== undefined ? { prize: normalizePrize(body.prize) } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update giveaway." }, { status: 500 });
  }
}
