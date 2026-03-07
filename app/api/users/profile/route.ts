import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminFirestore } from "@/lib/firebase/admin";
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
    const data = snap.data() as {
      phoneNumber?: string;
      email?: string;
      fullName?: string;
      displayName?: string;
      createdAt?: unknown;
      updatedAt?: unknown;
    } | undefined;

    return NextResponse.json({
      uid,
      email: data?.email ?? email ?? null,
      displayName: data?.fullName ?? data?.displayName ?? null,
      fullName: data?.fullName ?? data?.displayName ?? null,
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
    const body = (await request.json()) as { phoneNumber?: string | null; displayName?: string | null };
    const hasPhoneInput = body.phoneNumber !== undefined;
    const hasNameInput = body.displayName !== undefined;
    if (!hasPhoneInput && !hasNameInput) {
      return NextResponse.json({ error: "At least one profile field is required." }, { status: 400 });
    }

    let normalizedPhone: string | null = null;
    if (hasPhoneInput) {
      normalizedPhone = normalizePhone(body.phoneNumber ?? "");
      if (!normalizedPhone || normalizedPhone.length < 7) {
        return NextResponse.json({ error: "Valid phone number is required." }, { status: 400 });
      }
    }

    let normalizedName: string | null = null;
    if (hasNameInput) {
      normalizedName = (body.displayName ?? "").trim();
      if (!normalizedName) {
        return NextResponse.json({ error: "Full name is required." }, { status: 400 });
      }
    }

    const ref = adminFirestore.collection("users").doc(uid);
    const now = Timestamp.now();
    const updates: Record<string, unknown> = {
      uid,
      email: email ?? null,
      updatedAt: now,
      createdAt: now,
    };
    if (hasPhoneInput) updates.phoneNumber = normalizedPhone;
    if (hasNameInput) {
      updates.displayName = normalizedName;
      updates.fullName = normalizedName;
    }

    await ref.set(
      updates,
      { merge: true },
    );

    if (hasNameInput) {
      await adminAuth.updateUser(uid, { displayName: normalizedName });
    }

    return NextResponse.json({
      ok: true,
      phoneNumber: hasPhoneInput ? normalizedPhone : undefined,
      displayName: hasNameInput ? normalizedName : undefined,
      fullName: hasNameInput ? normalizedName : undefined,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Failed to update profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
