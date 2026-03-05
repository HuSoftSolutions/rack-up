import { NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import { firebaseAdminApp } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeName(name: string) {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return base || "logo";
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const form = await request.formData();
    const file = form.get("image");
    const businessId = (form.get("businessId") as string | null)?.trim();
    const locationId = (form.get("locationId") as string | null)?.trim();

    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "image file required" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image uploads are allowed." }, { status: 400 });
    }
    if (!businessId) {
      return NextResponse.json({ error: "businessId is required." }, { status: 400 });
    }

    const ext = file.name.split(".").pop() ?? "png";
    const baseName = sanitizeName(file.name.replace(/\.[^.]+$/, ""));
    const path = locationId
      ? `location-logos/${businessId}/${locationId}/${Date.now()}-${baseName}.${ext}`
      : `business-logos/${businessId}/${Date.now()}-${baseName}.${ext}`;

    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || firebaseAdminApp.options.storageBucket;
    if (!bucketName) {
      throw new Error("Storage bucket not configured. Set FIREBASE_STORAGE_BUCKET.");
    }
    const bucket = getStorage(firebaseAdminApp).bucket(bucketName);
    const ref = bucket.file(path);
    const buffer = Buffer.from(await file.arrayBuffer());
    await ref.save(buffer, {
      contentType: file.type,
      resumable: false,
      metadata: { cacheControl: "public,max-age=31536000" },
    });
    const [signedUrl] = await ref.getSignedUrl({
      action: "read",
      expires: Date.now() + 1000 * 60 * 60 * 24 * 365,
    });

    return NextResponse.json({ ok: true, path, url: signedUrl });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to upload logo.";
    const status = message.includes("Storage bucket") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
