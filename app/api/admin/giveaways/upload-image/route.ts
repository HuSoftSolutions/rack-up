import { NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import { firebaseAdminApp } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeName(name: string) {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return base || "image";
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "image file required" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image uploads are allowed." }, { status: 400 });
    }

    const giveawayId = (form.get("giveawayId") as string | null)?.trim() ?? "global";
    const ext = file.name.split(".").pop() ?? "jpg";
    const baseName = sanitizeName(file.name.replace(/\.[^.]+$/, ""));
    const path = `giveaway-prizes/${giveawayId}/${Date.now()}-${baseName}.${ext}`;

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

    return NextResponse.json({ ok: true, url: signedUrl, path });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to upload image.";
    const status = message.includes("Storage bucket") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
