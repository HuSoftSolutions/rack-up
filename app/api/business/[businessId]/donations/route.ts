import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, hasLocationAccess, requireBusinessAccess } from "@/lib/server/auth";

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

export async function GET(
  request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const { businessId: rawBusinessId } = await context.params;
  const businessId = rawBusinessId?.trim();
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required." }, { status: 400 });
  }

  try {
    const { membership } = await requireBusinessAccess(request, businessId);
    const url = new URL(request.url);
    const locationId = url.searchParams.get("locationId") || null;
    if (membership.role === "staff") {
      if (!locationId) {
        return NextResponse.json({ error: "locationId is required." }, { status: 400 });
      }
      if (!hasLocationAccess(membership, locationId)) {
        return NextResponse.json({ error: "Access denied for this location." }, { status: 403 });
      }
    }

    let queryRef = adminFirestore
      .collection("donations")
      .where("businessId", "==", businessId)
      .orderBy("createdAt", "desc");
    if (locationId) {
      queryRef = queryRef.where("locationId", "==", locationId);
    }
    const snapshot = await queryRef.limit(200).get();

    const donations = snapshot.docs
      .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        amountCents: data.amountCents ?? null,
        points: data.points ?? null,
        causeId: data.causeId ?? null,
        causeTitle: data.causeTitle ?? null,
        locationId: data.locationId ?? null,
        locationSlug: data.locationSlug ?? null,
        status: data.status ?? null,
        createdAt: toIso(data.createdAt),
        userId: data.userId ?? null,
        stripe: data.stripe ?? null,
      };
    })
      .filter((donation) =>
        membership.role === "owner"
          ? true
          : hasLocationAccess(membership, donation.locationId ?? undefined),
      );

    const totalVolume = donations.reduce(
      (sum, d) => sum + (typeof d.amountCents === "number" ? d.amountCents : 0),
      0,
    );

    return NextResponse.json({ donations, totalVolumeCents: totalVolume });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Access denied") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to load support.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
