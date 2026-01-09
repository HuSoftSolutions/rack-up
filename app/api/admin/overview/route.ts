import { NextResponse } from "next/server";
import { AggregateField } from "firebase-admin/firestore";
import { adminAuth, adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function countAuthUsers(): Promise<number> {
  let total = 0;
  let pageToken: string | undefined;

  do {
    const result = await adminAuth.listUsers(1000, pageToken);
    total += result.users.length;
    pageToken = result.pageToken;
  } while (pageToken);

  return total;
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const businessId = url.searchParams.get("businessId") || undefined;
    const locationId = url.searchParams.get("locationId") || undefined;

    let donationsQuery = adminFirestore.collection("donations").where("status", "==", "completed");
    let issuedQuery = adminFirestore
      .collection("transactions")
      .where("status", "==", "completed")
      .where("type", "==", "donation");
    let redeemedQuery = adminFirestore
      .collection("transactions")
      .where("status", "==", "completed")
      .where("type", "==", "redemption");

    if (businessId) {
      donationsQuery = donationsQuery.where("businessId", "==", businessId);
      issuedQuery = issuedQuery.where("businessId", "==", businessId);
      redeemedQuery = redeemedQuery.where("businessId", "==", businessId);
    }
    if (locationId) {
      donationsQuery = donationsQuery.where("locationId", "==", locationId);
      issuedQuery = issuedQuery.where("locationId", "==", locationId);
    }

    const donationsAggQuery = donationsQuery.aggregate({
      count: AggregateField.count(),
      totalAmountCents: AggregateField.sum("amountCents"),
    });

    const issuedAggQuery = issuedQuery.aggregate({
      count: AggregateField.count(),
      points: AggregateField.sum("pointsDelta"),
    });

    const redeemedAggQuery = redeemedQuery.aggregate({
      points: AggregateField.sum("pointsDelta"),
    });

    const [userCount, donationsAgg, issuedAgg, redeemedAgg] = await Promise.all([
      countAuthUsers(),
      donationsAggQuery.get(),
      issuedAggQuery.get(),
      redeemedAggQuery.get(),
    ]);

    const donations = donationsAgg.data();
    const issued = issuedAgg.data();
    const redeemed = redeemedAgg.data();

    const issuedPoints = typeof issued.points === "number" ? issued.points : 0;
    const redeemedPointsRaw =
      typeof redeemed.points === "number" ? redeemed.points : 0;
    const redeemedPoints = Math.abs(redeemedPointsRaw);
    const netPoints = issuedPoints + redeemedPointsRaw;

    return NextResponse.json({
      scope: { businessId: businessId ?? null, locationId: locationId ?? null },
      userCount,
      donationCount: donations.count ?? 0,
      donationVolumeCents: donations.totalAmountCents ?? 0,
      pointsIssued: issuedPoints,
      pointsRedeemed: redeemedPoints,
      netPoints,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error(err);
    return NextResponse.json(
      { error: "Failed to load admin overview stats." },
      { status: 500 },
    );
  }
}
