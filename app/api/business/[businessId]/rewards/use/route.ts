import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, hasLocationAccess, requireBusinessAccess } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

type UseBody = {
  code: string;
  locationId?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const { businessId: rawBusinessId } = await context.params;
  const businessId = rawBusinessId?.trim();
  if (!businessId) return badRequest("businessId is required.");

  let body: UseBody;
  try {
    body = (await request.json()) as UseBody;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const code = body.code?.trim().toUpperCase();
  const requestedLocationId = body.locationId?.trim() || null;
  if (!code) return badRequest("code is required.");

  try {
    const { uid, membership } = await requireBusinessAccess(request, businessId);
    if (membership.role === "staff") {
      if (!requestedLocationId) return badRequest("locationId is required.");
      if (!hasLocationAccess(membership, requestedLocationId)) {
        return badRequest("Access denied for this location.");
      }
    }
    const now = Timestamp.now();

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

    const result = await adminFirestore.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) return { status: "missing" as const };
      const current = fresh.data() as Record<string, unknown>;

      if (current.businessId && current.businessId !== businessId) {
        return { status: "wrong_business" as const, payload: current };
      }
      const issueLocationId = (current.redeemLocationId as string | undefined) ?? null;
      if (requestedLocationId && issueLocationId && issueLocationId !== requestedLocationId) {
        return { status: "wrong_location" as const, payload: current };
      }

      if (current.status === "expired") {
        return { status: "expired" as const, payload: current };
      }
      if (current.status === "used") {
        return { status: "used" as const, payload: current };
      }

      tx.update(ref, {
        status: "used",
        usedAt: now,
        updatedAt: now,
        usedBy: { staffId: uid },
      });
      return { status: "marked" as const, payload: current };
    });

    if (result.status === "missing") return badRequest("Unknown or invalid code.");
    if (result.status === "wrong_business")
      return badRequest("Code was issued by a different business.");
    if (result.status === "wrong_location")
      return badRequest("Code was issued for a different location.");
    if (result.status === "expired") return badRequest("Code has expired.");
    if (result.status === "used") return badRequest("Code already used.");

    const payload = result.payload;
    return NextResponse.json({
      ok: true,
      code,
      businessId: payload?.businessId ?? null,
      dealId: payload?.dealId ?? null,
      userId: payload?.userId ?? null,
      issuedAt: payload?.issuedAt ?? null,
      expiresAt: payload?.expiresAt ?? null,
      status: "used",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Access denied") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to redeem code.";
    return serverError(message);
  }
}
