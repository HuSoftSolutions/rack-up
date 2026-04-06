import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { writeFile, readFile, unlink, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { accessSync } from "fs";
import { getStorage } from "firebase-admin/storage";
import { requireAdmin, AuthError } from "@/lib/server/auth";
import { firebaseAdminApp, adminFirestore } from "@/lib/firebase/admin";

function findFfmpeg(): string {
  const cwdPath = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  try { accessSync(cwdPath); return cwdPath; } catch {}
  return "ffmpeg";
}

const ffmpegPath = findFfmpeg();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Upload to Firebase Storage + update Firestore in the background. */
function persistVideoAsync(mp4Buffer: Buffer, giveawayId: string | null) {
  (async () => {
    try {
      const bucketName = process.env.FIREBASE_STORAGE_BUCKET || firebaseAdminApp.options.storageBucket;
      if (!bucketName) {
        console.error("Storage bucket not configured");
        return;
      }

      const storagePath = `giveaway-videos/${giveawayId || "unknown"}/${Date.now()}-drawing.mp4`;
      const bucket = getStorage(firebaseAdminApp).bucket(bucketName);
      const ref = bucket.file(storagePath);
      await ref.save(mp4Buffer, {
        contentType: "video/mp4",
        resumable: false,
        metadata: { cacheControl: "public,max-age=31536000" },
      });
      const [signedUrl] = await ref.getSignedUrl({
        action: "read",
        expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 5,
      });

      if (giveawayId) {
        await adminFirestore.collection("giveaways").doc(giveawayId).update({
          drawingVideoUrl: signedUrl,
        });
      }

      console.log(`Drawing video saved for giveaway ${giveawayId}: ${storagePath}`);
    } catch (err) {
      console.error("Failed to persist drawing video:", err);
    }
  })();
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    const formData = await req.formData();
    const file = formData.get("video") as File | null;
    const giveawayId = (formData.get("giveawayId") as string | null)?.trim() || null;

    if (!file) {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    // Write WebM to a temp file
    const dir = await mkdtemp(join(tmpdir(), "convert-"));
    const inputPath = join(dir, "input.webm");
    const outputPath = join(dir, "output.mp4");

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(inputPath, buffer);

    // Convert using native FFmpeg
    await new Promise<void>((resolve, reject) => {
      execFile(
        ffmpegPath,
        ["-i", inputPath, "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-movflags", "+faststart", "-y", outputPath],
        { timeout: 55_000 },
        (err) => (err ? reject(err) : resolve()),
      );
    });

    const mp4Buffer = await readFile(outputPath);

    // Clean up temp files
    await Promise.all([unlink(inputPath), unlink(outputPath)]).catch(() => {});

    // Fire-and-forget: upload to Storage + update Firestore
    persistVideoAsync(mp4Buffer, giveawayId);

    // Return MP4 immediately for download
    return new NextResponse(mp4Buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="giveaway-drawing-${Date.now()}.mp4"`,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error("Video conversion failed:", err);
    return NextResponse.json({ error: "Conversion failed" }, { status: 500 });
  }
}
