import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminFirestore } from "@/lib/firebase/admin";
import { AuthError, hasLocationAccess, requireBusinessAccess } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MarkUsedBody = {
  issueId: string;
  locationId?: string;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const { businessId: rawBusinessId } = await context.params;
  const businessId = rawBusinessId?.trim();
  if (!businessId) return badRequest("businessId is required.");

  let body: MarkUsedBody;
  try {
    body = (await request.json()) as MarkUsedBody;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const issueId = body.issueId?.trim();
  const requestedLocationId = body.locationId?.trim() || null;
  if (!issueId) return badRequest("issueId is required.");

  try {
    const { uid, membership } = await requireBusinessAccess(request, businessId);
    if (membership.role === "staff") {
      if (!requestedLocationId) return badRequest("locationId is required.");
      if (!hasLocationAccess(membership, requestedLocationId)) {
        return badRequest("Access denied for this location.");
      }
    }
    const staffRecord = await adminAuth.getUser(uid);
    const staffEmail = staffRecord.email ?? null;
    const staffName = staffRecord.displayName ?? null;
    const now = Timestamp.now();
    const ref = adminFirestore.collection("reward_issues").doc(issueId);
    const result = await adminFirestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { status: "missing" as const };
      const data = snap.data() as Record<string, unknown>;
      if (data.businessId && data.businessId !== businessId) {
        return { status: "wrong_business" as const };
      }
      const status = (data.status as string | undefined) ?? "issued";
      const issueLocationId = (data.redeemLocationId as string | undefined) ?? null;
      if (requestedLocationId && issueLocationId && issueLocationId !== requestedLocationId) {
        return { status: "wrong_location" as const };
      }
      if (status === "used") return { status: "used" as const };
      if (status === "expired") return { status: "expired" as const };

      tx.update(ref, {
        status: "used",
        usedAt: now,
        updatedAt: now,
        usedBy: { staffId: uid, staffEmail, staffName },
      });
      return { status: "marked" as const };
    });

    if (result.status === "missing") return badRequest("Reward not found.");
    if (result.status === "wrong_business")
      return badRequest("Reward belongs to a different business.");
    if (result.status === "wrong_location")
      return badRequest("Reward belongs to a different location.");
    if (result.status === "used") return badRequest("Reward already marked used.");

    return NextResponse.json({ ok: true, issueId, status: "used" });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Access denied") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to mark reward used.";
    return serverError(message);
  }
}
