import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "");
}

export async function GET(request: Request) {
  try {
    const { uid, email } = await requireUser(request);
    const ref = adminFirestore.collection("users").doc(uid);
    const snap = await ref.get();
    const data = snap.data() as { phoneNumber?: string; email?: string; createdAt?: unknown; updatedAt?: unknown } | undefined;

    return NextResponse.json({
      uid,
      email: data?.email ?? email ?? null,
      phoneNumber: data?.phoneNumber ?? null,
      exists: snap.exists,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Failed to load profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { uid, email } = await requireUser(request);
    const body = (await request.json()) as { phoneNumber?: string | null };
    const normalized = normalizePhone(body.phoneNumber ?? "");
    if (!normalized || normalized.length < 7) {
      return NextResponse.json({ error: "Valid phone number is required." }, { status: 400 });
    }

    const ref = adminFirestore.collection("users").doc(uid);
    const now = Timestamp.now();
    await ref.set(
      {
        uid,
        email: email ?? null,
        phoneNumber: normalized,
        updatedAt: now,
        createdAt: now,
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, phoneNumber: normalized });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Failed to update profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
