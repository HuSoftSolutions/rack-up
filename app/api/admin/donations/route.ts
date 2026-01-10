import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializeDate(value: unknown): string | null {
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

export async function GET(request: Request) {
  try {
    await requireAdmin(request);

    const snapshot = await adminFirestore
      .collection("donations")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    const donations = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId ?? null,
        donorName: data.donorName ?? null,
        donorEmail: data.donorEmail ?? null,
        donorPhone: data.donorPhone ?? null,
        businessId: data.businessId ?? null,
        businessName: data.businessName ?? null,
        causeId: data.causeId ?? null,
        causeTitle: data.causeTitle ?? null,
        amountCents: data.amountCents ?? null,
        points: data.points ?? null,
        status: data.status ?? null,
        stripe: data.stripe ?? null,
        createdAt: serializeDate(data.createdAt),
      };
    });

    return NextResponse.json({ donations });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to load donations." }, { status: 500 });
  }
}
