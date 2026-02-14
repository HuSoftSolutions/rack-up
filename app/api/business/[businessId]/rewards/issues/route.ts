import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, hasLocationAccess, requireBusinessAccess } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RewardStatus = "issued" | "used" | "expired";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
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

export async function GET(
  request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const { businessId: rawBusinessId } = await context.params;
  const businessId = rawBusinessId?.trim();
  if (!businessId) return badRequest("businessId is required.");

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") as RewardStatus | null;
  const locationId = url.searchParams.get("locationId") || null;
  const statusFilter =
    statusParam && ["issued", "used", "expired"].includes(statusParam) ? statusParam : null;

  try {
    const { membership } = await requireBusinessAccess(request, businessId);
    if (membership.role === "staff") {
      if (!locationId) {
        return badRequest("locationId is required for staff.");
      }
      if (!hasLocationAccess(membership, locationId)) {
        return badRequest("Access denied for this location.");
      }
    }
    const collectionRef = adminFirestore.collection("reward_issues");
    let queryRef = collectionRef
      .where("businessId", "==", businessId)
      .orderBy("issuedAt", "desc");
    if (locationId) {
      queryRef = queryRef.where("redeemLocationId", "==", locationId);
    }
    const snapshot = await queryRef.limit(200).get();
    const issues = snapshot.docs.map((doc) => {
      const data = doc.data();
      const expiresAtMillis = toMillis(data.expiresAt);
      const issuedAtMillis = toMillis(data.issuedAt);
      const usedAtMillis = toMillis(data.usedAt);
      const status: RewardStatus = (data.status as RewardStatus) ?? "issued";

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
        userId: data.userId ?? null,
        userEmail: data.userEmail ?? data.email ?? null,
        userName: data.userName ?? null,
        dealId: data.dealId ?? null,
        businessId: data.businessId ?? null,
        status,
        issuedAt: issuedAtMillis ? new Date(issuedAtMillis).toISOString() : null,
        expiresAt: expiresAtMillis ? new Date(expiresAtMillis).toISOString() : null,
        usedAt: usedAtMillis ? new Date(usedAtMillis).toISOString() : null,
        title: payload?.title ?? null,
        businessName: payload?.businessName ?? null,
        redeemLocationId: data.redeemLocationId ?? null,
        redeemLocationName: data.redeemLocationName ?? null,
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

    const filteredIssues = statusFilter ? issues.filter((i) => i.status === statusFilter) : issues;

    return NextResponse.json({ issues: filteredIssues });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Access denied") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to load rewards.";
    return serverError(message);
  }
}
