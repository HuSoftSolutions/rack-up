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

    const scopeField = locationId ? "locationId" : businessId ? "businessId" : null;
    const scopeValue = locationId ?? businessId ?? null;

    const warnings: string[] = [];
    async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
      try {
        return await fn();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Admin overview failed: ${label}`, err);
        warnings.push(`${label}: ${message}`);
        return fallback;
      }
    }

    const [userCount, donationsStats, issuedPoints, redeemedPointsRaw] = await Promise.all([
      safe("userCount", () => countAuthUsers(), 0),
      safe(
        "donationsStats",
        () =>
          scopeField && scopeValue
            ? (async () => {
                const snapshot = await adminFirestore
                  .collection("donations")
                  .where(scopeField, "==", scopeValue)
                  .get();
                let count = 0;
                let totalAmountCents = 0;
                snapshot.docs.forEach((doc) => {
                  const data = doc.data();
                  if (data.status !== "completed") return;
                  count += 1;
                  totalAmountCents += typeof data.amountCents === "number" ? data.amountCents : 0;
                });
                return { count, totalAmountCents };
              })()
            : (async () => {
                const donationsAgg = await adminFirestore
                  .collection("donations")
                  .where("status", "==", "completed")
                  .aggregate({
                    count: AggregateField.count(),
                    totalAmountCents: AggregateField.sum("amountCents"),
                  })
                  .get();
                const data = donationsAgg.data();
                return {
                  count: data.count ?? 0,
                  totalAmountCents: data.totalAmountCents ?? 0,
                };
              })(),
        { count: 0, totalAmountCents: 0 },
      ),
      safe(
        "pointsIssued",
        () =>
          scopeField && scopeValue
            ? (async () => {
                const snapshot = await adminFirestore
                  .collection("transactions")
                  .where(scopeField, "==", scopeValue)
                  .get();
                let issued = 0;
                snapshot.docs.forEach((doc) => {
                  const data = doc.data();
                  if (data.status !== "completed") return;
                  if (data.type !== "donation") return;
                  issued += typeof data.pointsDelta === "number" ? data.pointsDelta : 0;
                });
                return issued;
              })()
            : (async () => {
                const issuedAgg = await adminFirestore
                  .collection("transactions")
                  .where("status", "==", "completed")
                  .where("type", "==", "donation")
                  .aggregate({
                    count: AggregateField.count(),
                    points: AggregateField.sum("pointsDelta"),
                  })
                  .get();
                const data = issuedAgg.data();
                return typeof data.points === "number" ? data.points : 0;
              })(),
        0,
      ),
      safe(
        "pointsRedeemed",
        () =>
          scopeField && scopeValue
            ? (async () => {
                const snapshot = await adminFirestore
                  .collection("transactions")
                  .where(scopeField, "==", scopeValue)
                  .get();
                let redeemed = 0;
                snapshot.docs.forEach((doc) => {
                  const data = doc.data();
                  if (data.status !== "completed") return;
                  if (data.type !== "redemption") return;
                  redeemed += typeof data.pointsDelta === "number" ? data.pointsDelta : 0;
                });
                return redeemed;
              })()
            : (async () => {
                const redeemedAgg = await adminFirestore
                  .collection("transactions")
                  .where("status", "==", "completed")
                  .where("type", "==", "redemption")
                  .aggregate({
                    points: AggregateField.sum("pointsDelta"),
                  })
                  .get();
                const data = redeemedAgg.data();
                return typeof data.points === "number" ? data.points : 0;
              })(),
        0,
      ),
    ]);

    const issuedPointsValue = issuedPoints;
    const redeemedPoints = Math.abs(redeemedPointsRaw);
    const netPoints = issuedPointsValue + redeemedPointsRaw;

    return NextResponse.json({
      scope: { businessId: businessId ?? null, locationId: locationId ?? null },
      userCount,
      donationCount: donationsStats.count,
      donationVolumeCents: donationsStats.totalAmountCents,
      pointsIssued: issuedPointsValue,
      pointsRedeemed: redeemedPoints,
      netPoints,
      warnings: warnings.length > 0 ? warnings : undefined,
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
