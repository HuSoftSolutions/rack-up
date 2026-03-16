import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/lib/server/auth";
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

export async function GET(request: Request) {
  try {
    await requireUser(request);
    const snap = await adminFirestore
      .collection("notifications")
      .where("active", "==", true)
      .get();
    const notifications = snap.docs.map((doc) => {
      const data = doc.data() as PlatformNotificationDoc;
      return {
        id: doc.id,
        title: data.title,
        description: data.description,
        color:
          data.color === "emerald" ||
          data.color === "blue" ||
          data.color === "red" ||
          data.color === "zinc"
            ? data.color
            : "amber",
        createdAt: toIso(data.createdAt),
      };
    })
    .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""))
    .slice(0, 10);
    return NextResponse.json({ notifications });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Failed to load notifications.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
