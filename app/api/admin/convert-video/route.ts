import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { requireAdmin, AuthError } from "@/lib/server/auth";
import { firebaseAdminApp, adminFirestore } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    const formData = await req.formData();
    const file = formData.get("video") as File | null;
    const giveawayId = (formData.get("giveawayId") as string | null)?.trim() || null;

    if (!file) {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || firebaseAdminApp.options.storageBucket;
    if (!bucketName) {
      return NextResponse.json({ error: "Storage bucket not configured" }, { status: 500 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `giveaway-videos/${giveawayId || "unknown"}/${Date.now()}-drawing.webm`;
    const bucket = getStorage(firebaseAdminApp).bucket(bucketName);
    const ref = bucket.file(storagePath);

    await ref.save(buffer, {
      contentType: "video/webm",
      resumable: false,
      metadata: { cacheControl: "public,max-age=31536000" },
    });

    const [signedUrl] = await ref.getSignedUrl({
      action: "read",
      expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 5,
    });

    // Save the raw WebM URL — Cloud Function will set drawingVideoUrl once MP4 is ready
    if (giveawayId) {
      await adminFirestore.collection("giveaways").doc(giveawayId).update({
        drawingVideoRawUrl: signedUrl,
      });
    }

    return NextResponse.json({ ok: true, url: signedUrl });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error("Video upload failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
