import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  title?: string;
  description?: string;
  color?: "amber" | "emerald" | "blue" | "red" | "zinc";
  active?: boolean;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function normalizeColor(value: unknown): "amber" | "emerald" | "blue" | "red" | "zinc" | null {
  if (value === "amber" || value === "emerald" || value === "blue" || value === "red" || value === "zinc") {
    return value;
  }
  return null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ notificationId: string }> },
) {
  try {
    await requireAdmin(request);
    const { notificationId } = await context.params;
    if (!notificationId) return badRequest("notificationId is required.");
    const body = (await request.json()) as Body;

    const updates: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };
    if (body.title !== undefined) {
      const title = body.title.trim();
      if (!title) return badRequest("title cannot be empty.");
      updates.title = title;
    }
    if (body.description !== undefined) {
      const description = body.description.trim();
      if (!description) return badRequest("description cannot be empty.");
      updates.description = description;
    }
    if (body.color !== undefined) {
      const color = normalizeColor(body.color);
      if (!color) return badRequest("Invalid color.");
      updates.color = color;
    }
    if (body.active !== undefined) {
      updates.active = body.active === true;
    }

    await adminFirestore.collection("notifications").doc(notificationId).set(updates, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to update notification.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
