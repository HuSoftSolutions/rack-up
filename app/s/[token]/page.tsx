import { notFound } from "next/navigation";
import { getStorage } from "firebase-admin/storage";
import PublicShell from "@/app/_components/PublicNav";
import { adminFirestore, firebaseAdminApp } from "@/lib/firebase/admin";
import { inspectScanEventToken, mapScanEventDocToPublic } from "@/lib/server/scan-events";
import { loadProximityEnforcement } from "@/lib/server/proximity-settings";
import type { ScanEventDoc } from "@/lib/types/scan-event";
import ScanClaimClient from "./claim-client";

async function resolveScanImageUrl(data: ScanEventDoc): Promise<string | null> {
  if (data.imageUrl) return data.imageUrl;
  if (!data.imagePath) return null;
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || firebaseAdminApp.options.storageBucket;
  if (!bucketName) return null;
  try {
    const bucket = getStorage(firebaseAdminApp).bucket(bucketName);
    const file = bucket.file(data.imagePath);
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 1000 * 60 * 60 * 24,
    });
    return signedUrl;
  } catch {
    return null;
  }
}

async function resolveAssociatedImageUrl(data: ScanEventDoc): Promise<string | null> {
  try {
    if (data.association?.type === "charity" && data.association.causeId) {
      const causeSnap = await adminFirestore.collection("causes").doc(data.association.causeId).get();
      if (causeSnap.exists) {
        const cause = causeSnap.data() as { imageUrl?: string };
        if (cause?.imageUrl) return cause.imageUrl;
      }
    }

    if (data.association?.type === "business_location" && data.association.businessId) {
      const businessRef = adminFirestore.collection("businesses").doc(data.association.businessId);
      const businessSnap = await businessRef.get();
      if (businessSnap.exists) {
        const business = businessSnap.data() as { logoUrl?: string };
        if (data.association.locationId) {
          const locationSnap = await businessRef.collection("locations").doc(data.association.locationId).get();
          if (locationSnap.exists) {
            const location = locationSnap.data() as { logoUrl?: string };
            if (location?.logoUrl) return location.logoUrl;
          }
        }
        if (business?.logoUrl) return business.logoUrl;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export default async function ScanEventPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inspected = inspectScanEventToken(token);
  if (!inspected.ok) notFound();

  const snap = await adminFirestore.collection("scan_events").doc(inspected.eventId).get();
  if (!snap.exists) notFound();
  const data = snap.data() as ScanEventDoc;
  if (data.active === false) notFound();
  const event = mapScanEventDocToPublic(snap.id, data, await loadProximityEnforcement());
  event.imageUrl = (await resolveScanImageUrl(data)) ?? (await resolveAssociatedImageUrl(data));

  return (
    <PublicShell contentClassName="py-10">
      <ScanClaimClient token={token} event={event} />
    </PublicShell>
  );
}
