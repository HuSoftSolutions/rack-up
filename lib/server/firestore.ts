import { adminFirestore } from "@/lib/firebase/admin";
import { slugify } from "@/lib/utils/slugify";
import type { BusinessDoc, CauseDoc, LocationDoc } from "@/lib/types/business";
import { Timestamp } from "firebase-admin/firestore";

export async function createBusiness(input: {
  name: string;
  description?: string;
  slug?: string;
  active?: boolean;
}): Promise<{ id: string; slug: string }> {
  const now = Timestamp.now();
  const slug = (input.slug || slugify(input.name)).toLowerCase();
  const ref = adminFirestore.collection("businesses").doc(slug);
  await ref.set({
    name: input.name,
    description: input.description ?? "",
    slug,
    active: input.active ?? true,
    createdAt: now,
    updatedAt: now,
  } satisfies BusinessDoc);
  return { id: ref.id, slug };
}

export async function createLocation(input: {
  businessId: string;
  name: string;
  address?: string;
  slug?: string;
  active?: boolean;
}): Promise<{ id: string; slug: string }> {
  const now = Timestamp.now();
  const slug = (input.slug || slugify(input.name)).toLowerCase();
  const ref = adminFirestore
    .collection("businesses")
    .doc(input.businessId)
    .collection("locations")
    .doc(slug);

  await ref.set({
    businessId: input.businessId,
    name: input.name,
    slug,
    address: input.address ?? "",
    active: input.active ?? true,
    createdAt: now,
    updatedAt: now,
  } satisfies LocationDoc);

  return { id: ref.id, slug };
}

export async function createCause(input: {
  businessId: string;
  title: string;
  description?: string;
  mode: "custom" | "predefined";
  pointsPerDollar?: number;
  predefinedOptions?: { amountCents: number; points: number; label?: string }[];
  minAmountCents?: number;
  maxAmountCents?: number;
  locationIds?: string[];
  slug?: string;
  active?: boolean;
}): Promise<{ id: string; slug: string }> {
  const now = Timestamp.now();
  const slug = (input.slug || slugify(input.title)).toLowerCase();
  const ref = adminFirestore
    .collection("businesses")
    .doc(input.businessId)
    .collection("causes")
    .doc(slug);

  await ref.set({
    businessId: input.businessId,
    title: input.title,
    description: input.description ?? "",
    slug,
    mode: input.mode,
    pointsPerDollar: input.pointsPerDollar,
    predefinedOptions: input.predefinedOptions ?? [],
    minAmountCents: input.minAmountCents,
    maxAmountCents: input.maxAmountCents,
    locationIds: input.locationIds ?? [],
    active: input.active ?? true,
    createdAt: now,
    updatedAt: now,
  } satisfies CauseDoc);

  return { id: ref.id, slug };
}

export async function fetchDonationConfig(params: {
  businessSlug: string;
  causeSlug: string;
  locationSlug: string;
}): Promise<{
  business: BusinessDoc & { id: string };
  cause: CauseDoc & { id: string };
  location: LocationDoc & { id: string };
} | null> {
  const businessRef = adminFirestore.collection("businesses").doc(params.businessSlug);
  const businessSnap = await businessRef.get();
  if (!businessSnap.exists) return null;

  const locationRef = businessRef.collection("locations").doc(params.locationSlug);
  const locationSnap = await locationRef.get();
  if (!locationSnap.exists) return null;

  const locationData = locationSnap.data() as LocationDoc;

  // Require cause link to a global cause
  const linkSnap = await businessRef.collection("cause_links").doc(params.causeSlug).get();
  if (!linkSnap.exists) return null;

  const link = linkSnap.data() as { causeId?: string; locationIds?: string[] };
  const globalId = (link.causeId || params.causeSlug).toString();
  const globalSnap = await adminFirestore.collection("causes").doc(globalId).get();
  if (!globalSnap.exists) return null;

  if (link.locationIds && link.locationIds.length > 0 && !link.locationIds.includes(locationSnap.id)) {
    return null;
  }

  return {
    business: { id: businessRef.id, ...(businessSnap.data() as BusinessDoc) },
    cause: { id: globalSnap.id, ...(globalSnap.data() as CauseDoc) },
    location: { id: locationRef.id, ...locationData },
  };
}
