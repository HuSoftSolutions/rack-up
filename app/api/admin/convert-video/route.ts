import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { requireAdmin, AuthError } from "@/lib/server/auth";
import { firebaseAdminApp } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InitBody = {
  giveawayId?: string;
  contentType?: string;
};

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    let body: InitBody;
    try {
      body = (await req.json()) as InitBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const giveawayId = body.giveawayId?.trim();
    if (!giveawayId) {
      return NextResponse.json({ error: "giveawayId is required" }, { status: 400 });
    }
    const contentType =
      typeof body.contentType === "string" && body.contentType.startsWith("video/webm")
        ? body.contentType
        : "video/webm";

    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || firebaseAdminApp.options.storageBucket;
    if (!bucketName) {
      return NextResponse.json({ error: "Storage bucket not configured" }, { status: 500 });
    }

    const storagePath = `giveaway-videos/${giveawayId}/${Date.now()}-drawing.webm`;
    const bucket = getStorage(firebaseAdminApp).bucket(bucketName);
    const ref = bucket.file(storagePath);

    const [uploadUrl] = await ref.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 1000 * 60 * 15,
      contentType,
    });

    return NextResponse.json({ ok: true, uploadUrl, storagePath, contentType });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error("Video upload init failed:", err);
    return NextResponse.json({ error: "Upload init failed" }, { status: 500 });
  }
}
