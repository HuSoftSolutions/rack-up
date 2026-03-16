import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import type { PlatformNotificationDoc } from "@/lib/types/notification";

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

type Body = {
  title?: string;
  description?: string;
  color?: "amber" | "emerald" | "blue" | "red" | "zinc";
  active?: boolean;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function normalizeColor(value: unknown): PlatformNotificationDoc["color"] {
  if (value === "emerald" || value === "blue" || value === "red" || value === "zinc") return value;
  return "amber";
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const snap = await adminFirestore.collection("notifications").orderBy("createdAt", "desc").limit(200).get();
    const notifications = snap.docs.map((doc) => {
      const data = doc.data() as PlatformNotificationDoc;
      return {
        id: doc.id,
        title: data.title,
        description: data.description,
        color: normalizeColor((data as { color?: unknown }).color),
        active: data.active !== false,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });
    return NextResponse.json({ notifications });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to load notifications.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const body = (await request.json()) as Body;
    const title = (body.title ?? "").trim();
    const description = (body.description ?? "").trim();
    if (!title) return badRequest("title is required.");
    if (!description) return badRequest("description is required.");
    const now = Timestamp.now();
    const ref = adminFirestore.collection("notifications").doc();
    await ref.set({
      title,
      description,
      color: normalizeColor(body.color),
      active: body.active !== false,
      createdAt: now,
      updatedAt: now,
    } satisfies PlatformNotificationDoc);
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to create notification.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
