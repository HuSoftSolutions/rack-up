import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

type UseBody = {
  code: string;
  businessId?: string;
};

function requireRedeemKey(request: Request) {
  const secret = process.env.REWARD_REDEEM_SECRET;
  if (!secret) throw new Error("Missing REWARD_REDEEM_SECRET env var.");
  const header = request.headers.get("x-reward-redeem-key");
  if (header !== secret) {
    throw new Error("Invalid redeem key.");
  }
}

export async function POST(request: Request) {
  let body: UseBody;
  try {
    body = (await request.json()) as UseBody;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const code = body.code?.trim().toUpperCase();
  const businessId = body.businessId?.trim();
  if (!code) return badRequest("code is required.");

  try {
    requireRedeemKey(request);

    const querySnap = await adminFirestore
      .collection("reward_issues")
      .where("code", "==", code)
      .limit(2)
      .get();

    if (querySnap.empty) return badRequest("Unknown or invalid code.");
    if (querySnap.docs.length > 1) {
      return serverError("Non-unique code encountered; contact support.");
    }

    const docSnap = querySnap.docs[0];
    const ref = docSnap.ref;
    const data = docSnap.data();

    if (businessId && data.businessId && data.businessId !== businessId) {
      return badRequest("Code does not belong to this business.");
    }

    const now = Timestamp.now();

    const result = await adminFirestore.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) return { status: "missing" as const };
      const current = fresh.data() as Record<string, unknown>;

      // Expire on read if past expiry.
      const expiresAt = current.expiresAt as { toMillis?: () => number } | undefined;
      if (typeof expiresAt?.toMillis === "function") {
        const expired = expiresAt.toMillis() < Date.now();
        if (expired && current.status !== "expired") {
          tx.update(ref, { status: "expired", updatedAt: now });
          return { status: "expired" as const, payload: current };
        }
      }

      if (current.status === "used") {
        return { status: "used" as const, payload: current };
      }

      tx.update(ref, {
        status: "used",
        usedAt: now,
        updatedAt: now,
      });
      return { status: "marked" as const, payload: current };
    });

    if (result.status === "missing") return badRequest("Unknown or invalid code.");
    if (result.status === "expired") return badRequest("Code has expired.");
    if (result.status === "used") {
      return badRequest("Code already used.");
    }

    const payload = result.payload ?? data;
    return NextResponse.json({
      ok: true,
      code,
      businessId: payload.businessId ?? null,
      dealId: payload.dealId ?? null,
      userId: payload.userId ?? null,
      issuedAt: payload.issuedAt ?? null,
      expiresAt: payload.expiresAt ?? null,
      status: "used",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to redeem code.";
    if (message.includes("redeem key")) return unauthorized("Unauthorized.");
    return serverError(message);
  }
}
