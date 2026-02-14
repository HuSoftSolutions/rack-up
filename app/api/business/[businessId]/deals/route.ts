import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, hasLocationAccess, requireBusinessAccess } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DealType = "percent_off" | "amount_off" | "bogo" | "free_item";

type DealInput = {
  title: string;
  description?: string;
  pointCost: number;
  type: DealType;
  terms?: string;
  locations?: string[];
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

function mapDeal(doc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>) {
  const data = doc.data() ?? {};
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
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await context.params;
  if (!businessId) return badRequest("businessId is required.");
  try {
    const { membership } = await requireBusinessAccess(request, businessId);
    const snapshot = await adminFirestore
      .collection("deals")
      .where("businessId", "==", businessId)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();

    const deals = snapshot.docs.map(mapDeal).filter((deal) => {
      if (membership.role === "owner") return true;
      if (!Array.isArray(deal.locations) || deal.locations.length === 0) return true;
      return deal.locations.some((loc) => hasLocationAccess(membership, loc));
    });

    return NextResponse.json({ deals });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Access denied") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to load deals.";
    return serverError(message);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await context.params;
  if (!businessId) return badRequest("businessId is required.");

  let body: DealInput;
  try {
    body = (await request.json()) as DealInput;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const title = body.title?.trim();
  const description = body.description?.trim() || "";
  const pointCost = Number(body.pointCost);
  const type = body.type;
  const terms = body.terms?.trim() || "";
  const locations =
    Array.isArray(body.locations) && body.locations.length > 0
      ? body.locations.map((loc) => loc.trim()).filter(Boolean)
      : [];

  if (!title) return badRequest("title is required.");
  if (!Number.isFinite(pointCost) || pointCost <= 0) {
    return badRequest("pointCost must be > 0.");
  }
  const validTypes: DealType[] = ["percent_off", "amount_off", "bogo", "free_item"];
  if (!validTypes.includes(type)) return badRequest("Invalid type.");

  try {
    const { uid, membership } = await requireBusinessAccess(request, businessId);
    if (membership.role !== "owner") {
      const allowed = new Set(membership.locationIds ?? []);
      if (allowed.size === 0) {
        return badRequest("No location access configured for this staff account.");
      }
      if (locations.length === 0) {
        return badRequest("Staff must select at least one location.");
      }
      const invalid = locations.filter((loc) => !allowed.has(loc));
      if (invalid.length > 0) {
        return badRequest("One or more locations are outside your allowed access.");
      }
    }
    const now = Timestamp.now();

    const businessSnap = await adminFirestore.collection("businesses").doc(businessId).get();
    const businessName =
      (businessSnap.exists ? (businessSnap.data()?.name as string | undefined) : undefined) ??
      businessId;

    const docRef = adminFirestore.collection("deals").doc();
    await docRef.set({
      businessId,
      businessName,
      title,
      description,
      pointCost,
      type,
      terms,
      locations: locations.map((label) => ({ label })),
      active: true,
      createdAt: now,
      updatedAt: now,
      createdBy: uid,
    });

    const created = await docRef.get();
    return NextResponse.json({ deal: mapDeal(created as typeof created) });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Access denied") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to create deal.";
    return serverError(message);
  }
}
