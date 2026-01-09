import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapDeal(doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>) {
  const data = doc.data();
  return {
    id: doc.id,
    businessId: data.businessId ?? null,
    businessName: data.businessName ?? null,
    title: data.title ?? null,
    description: data.description ?? null,
    type: data.type ?? null,
    terms: data.terms ?? null,
    pointCost: data.pointCost ?? null,
    locations: Array.isArray(data.locations)
      ? data.locations.map((loc) => (typeof loc === "string" ? loc : loc?.label)).filter(Boolean)
      : [],
    active: data.active ?? false,
  };
}

export async function GET() {
  try {
    const snapshot = await adminFirestore
      .collection("deals")
      .where("active", "==", true)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    return NextResponse.json({ deals: snapshot.docs.map(mapDeal) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load deals.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
