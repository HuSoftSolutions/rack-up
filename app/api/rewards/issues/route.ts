import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

function toMillis(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  if ("toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  if ("_seconds" in value && typeof (value as { _seconds: unknown })._seconds === "number") {
    const ts = value as { _seconds: number; _nanoseconds?: number };
    return ts._seconds * 1000 + Math.floor((ts._nanoseconds ?? 0) / 1_000_000);
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const { uid } = await requireUser(request);
    const now = Date.now();
    const snapshot = await adminFirestore
      .collection("reward_issues")
      .where("userId", "==", uid)
      .orderBy("issuedAt", "desc")
      .limit(50)
      .get();

    const expireUpdates: Promise<unknown>[] = [];
    const issues = snapshot.docs.map((doc) => {
      const data = doc.data();
      const expiresAtMillis = toMillis(data.expiresAt);
      const issuedAtMillis = toMillis(data.issuedAt);
      const usedAtMillis = toMillis(data.usedAt);
      let status: string = data.status ?? "issued";

      if (status === "issued" && expiresAtMillis && expiresAtMillis < now) {
        status = "expired";
        expireUpdates.push(doc.ref.update({ status: "expired", updatedAt: Timestamp.now() }));
      }

      const payload = data.displayPayload as
        | {
            title?: string;
            businessName?: string;
            dealType?: string;
            terms?: string;
            locations?: unknown[];
          }
        | undefined;

      return {
        id: doc.id,
        code: data.code ?? null,
        dealId: data.dealId ?? null,
        businessId: data.businessId ?? null,
        status,
        issuedAt: issuedAtMillis ? new Date(issuedAtMillis).toISOString() : null,
        expiresAt: expiresAtMillis ? new Date(expiresAtMillis).toISOString() : null,
        usedAt: usedAtMillis ? new Date(usedAtMillis).toISOString() : null,
        title: payload?.title ?? null,
        businessName: payload?.businessName ?? null,
        usedBy:
          typeof data.usedBy === "object" && data.usedBy
            ? {
                staffId: (data.usedBy as { staffId?: string }).staffId ?? null,
                staffEmail: (data.usedBy as { staffEmail?: string }).staffEmail ?? null,
                staffName: (data.usedBy as { staffName?: string }).staffName ?? null,
              }
            : null,
      };
    });

    if (expireUpdates.length > 0) {
      await Promise.allSettled(expireUpdates);
    }

    return NextResponse.json({ issues });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    const message = err instanceof Error ? err.message : "Failed to load rewards.";
    return serverError(message);
  }
}
