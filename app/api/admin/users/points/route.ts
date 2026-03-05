import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  userId?: string;
  pointsDelta?: number;
  reason?: string;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const userId = body.userId?.trim();
    const pointsDelta = typeof body.pointsDelta === "number" ? body.pointsDelta : NaN;
    const reason = body.reason?.trim();

    if (!userId) return badRequest("userId is required.");
    if (!Number.isFinite(pointsDelta) || pointsDelta === 0) {
      return badRequest("pointsDelta must be a non-zero number.");
    }
    if (!reason) return badRequest("reason is required.");

    const now = Timestamp.now();
    const txRef = adminFirestore.collection("transactions").doc();
    await txRef.set({
      type: "adjustment",
      status: "completed",
      pointsDelta,
      userId,
      adminId: admin.uid,
      reason,
      createdAt: now,
    });

    return NextResponse.json({ ok: true, id: txRef.id });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to adjust points." }, { status: 500 });
  }
}
