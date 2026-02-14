import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ dealId: string }> },
) {
  const { dealId } = await context.params;
  if (!dealId) return notFound("deal not found.");

  const snapshot = await adminFirestore.collection("deals").doc(dealId).get();
  if (!snapshot.exists) return notFound("deal not found.");
  const data = snapshot.data();
  if (!data?.active) {
    return notFound("deal not available.");
  }
  const businessId = data.businessId ?? null;
  let locationOptions: { id: string; name: string }[] = [];
  if (businessId) {
    const locationsSnap = await adminFirestore
      .collection("businesses")
      .doc(businessId)
      .collection("locations")
      .get();
    const allLocations = locationsSnap.docs.map((doc) => {
      const locData = doc.data() as { name?: string };
      return { id: doc.id, name: locData.name ?? doc.id };
    });
    const allowedIds = Array.isArray(data.locations)
      ? data.locations
          .map((loc) => (typeof loc === "string" ? loc : loc?.label))
          .filter((value): value is string => typeof value === "string" && value.length > 0)
      : [];
    locationOptions =
      allowedIds.length > 0
        ? allLocations.filter((loc) => allowedIds.includes(loc.id))
        : allLocations;
  }

  return NextResponse.json({
    deal: {
      id: snapshot.id,
      businessId,
      businessName: data.businessName ?? null,
      title: data.title ?? null,
      description: data.description ?? null,
      type: data.type ?? null,
      terms: data.terms ?? null,
      pointCost: data.pointCost ?? null,
      locations: Array.isArray(data.locations)
        ? data.locations.map((loc) => (typeof loc === "string" ? loc : loc?.label)).filter(Boolean)
        : [],
      locationOptions,
    },
  });
}
