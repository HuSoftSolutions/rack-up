import { notFound } from "next/navigation";
import { adminFirestore } from "@/lib/firebase/admin";
import DealRedeemCard from "./redeem-client";

export const dynamic = "force-dynamic";

type Deal = {
  id: string;
  businessId: string | null;
  businessName: string | null;
  title: string | null;
  description: string | null;
  terms: string | null;
  pointCost: number | null;
  type: string | null;
  locations: string[];
  locationOptions?: { id: string; name: string }[];
};

async function getDeal(dealId: string) {
  const snapshot = await adminFirestore.collection("deals").doc(dealId).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  if (!data?.active) return null;
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
  const deal: Deal = {
    id: snapshot.id,
    businessId,
    businessName: data.businessName ?? null,
    title: data.title ?? null,
    description: data.description ?? null,
    terms: data.terms ?? null,
    pointCost: data.pointCost ?? null,
    type: data.type ?? null,
    locations: Array.isArray(data.locations)
      ? data.locations.map((loc) => (typeof loc === "string" ? loc : loc?.label)).filter(Boolean)
      : [],
    locationOptions,
  };
  return deal;
}

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;
  const deal = await getDeal(dealId);
  if (!deal) notFound();

  return <DealRedeemCard deal={deal} />;
}
