import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireBusinessAccess } from "@/lib/server/auth";
import { createCauseQrToken, createLocationQrToken } from "@/lib/server/qr-access";
import type { CauseDoc } from "@/lib/types/business";

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
  if (!businessId) return NextResponse.json({ error: "businessId is required." }, { status: 400 });

  try {
    await requireBusinessAccess(request, businessId);

    const businessRef = adminFirestore.collection("businesses").doc(businessId);
    const businessSnap = await businessRef.get();
    if (!businessSnap.exists) {
      return NextResponse.json({ error: "Business not found." }, { status: 404 });
    }

    const [locationsSnap, linksSnap, globalCausesSnap] = await Promise.all([
      businessRef.collection("locations").get(),
      businessRef.collection("cause_links").get(),
      adminFirestore.collection("causes").get(),
    ]);

    const business = businessSnap.data() as { slug?: string; name?: string };
    const businessSlug = business.slug ?? businessId;

    const locations = locationsSnap.docs.map((doc) => {
      const locationSlug = doc.id;
      return {
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
        donationUrl: `/donate/location/${businessSlug}/${locationSlug}?qr=${encodeURIComponent(
          createLocationQrToken({ businessSlug, locationSlug }),
        )}`,
      };
    });

    const globalMap = new Map(
      globalCausesSnap.docs.map((d) => [d.id, { id: d.id, ...(d.data() as CauseDoc) }]),
    );

    const linkedCauses = linksSnap.docs
      .map((linkDoc) => {
        const link = linkDoc.data() as { causeId?: string; causeSlug?: string; locationIds?: string[] };
        const causeId = link.causeId || linkDoc.id;
        const cause = globalMap.get(causeId);
        if (!cause) return null;
        const allowedLocations =
          link.locationIds && link.locationIds.length > 0
            ? locations.filter((loc) => link.locationIds?.includes(loc.id))
            : locations;
        return {
          ...cause,
          id: linkDoc.id,
          createdAt: toIso((cause as { createdAt?: unknown }).createdAt),
          updatedAt: toIso((cause as { updatedAt?: unknown }).updatedAt),
          selectedLocationIds: link.locationIds ?? [],
          urls: allowedLocations.map((loc) => ({
            locationId: loc.id,
            locationName: (loc as { name?: string }).name ?? loc.id,
            url: `/donate/${businessSlug}/${linkDoc.id}/${loc.id}?qr=${encodeURIComponent(
              createCauseQrToken({
                businessSlug,
                causeSlug: linkDoc.id,
                locationSlug: loc.id,
              }),
            )}`,
          })),
        };
      })
      .filter(Boolean) as unknown as Record<string, unknown>[];

    // only linked/global causes are returned; legacy per-business causes are ignored
    const causes = linkedCauses;

    return NextResponse.json({
      business: { id: businessId, name: business.name ?? businessId, slug: businessSlug },
      locations,
      causes,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Access denied") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to load causes.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
