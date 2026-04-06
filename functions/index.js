const { setGlobalOptions } = require("firebase-functions");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { initializeApp } = require("firebase-admin/app");
const { getStorage } = require("firebase-admin/storage");
const { getFirestore } = require("firebase-admin/firestore");
const { execFile } = require("child_process");
const { unlink, mkdtemp } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");

initializeApp();
setGlobalOptions({ maxInstances: 10 });

/**
 * Triggered when a WebM file is uploaded to giveaway-videos/.
 * Converts it to MP4 using FFmpeg (pre-installed on Cloud Functions)
 * and updates the Firestore giveaway document with the MP4 URL.
 */
exports.convertDrawingVideo = onObjectFinalized(
  {
    memory: "2GiB",
    timeoutSeconds: 300,
    cpu: 2,
  },
  async (event) => {
    const filePath = event.data.name;
    const contentType = event.data.contentType;

    // Only process WebM files in giveaway-videos/
    if (!filePath.startsWith("giveaway-videos/") || !contentType.startsWith("video/webm")) {
      return;
    }

    // Don't process files in the converted/ subfolder (avoid loops)
    if (filePath.includes("/converted/")) {
      return;
    }

    // Extract giveawayId from path: giveaway-videos/{giveawayId}/{timestamp}-drawing.webm
    const parts = filePath.split("/");
    const giveawayId = parts[1];
    if (!giveawayId || giveawayId === "unknown") {
      console.log("Skipping video with unknown giveawayId:", filePath);
      return;
    }

    const bucket = getStorage().bucket(event.data.bucket);
    const dir = await mkdtemp(join(tmpdir(), "convert-"));
    const inputPath = join(dir, "input.webm");
    const outputPath = join(dir, "output.mp4");

    try {
      // Download the WebM file
      await bucket.file(filePath).download({ destination: inputPath });

      // Convert to MP4 using FFmpeg (pre-installed on Cloud Functions)
      await new Promise((resolve, reject) => {
        execFile(
          "ffmpeg",
          [
            "-i", inputPath,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-movflags", "+faststart",
            "-y",
            outputPath,
          ],
          { timeout: 240_000 },
          (err) => (err ? reject(err) : resolve()),
        );
      });

      // Upload the MP4
      const mp4Path = `giveaway-videos/${giveawayId}/converted/${parts[2].replace(".webm", ".mp4")}`;
      await bucket.upload(outputPath, {
        destination: mp4Path,
        metadata: {
          contentType: "video/mp4",
          cacheControl: "public,max-age=31536000",
        },
      });

      // Make the file publicly readable and use the public URL
      await bucket.file(mp4Path).makePublic();
      const publicUrl = `https://storage.googleapis.com/${event.data.bucket}/${mp4Path}`;

      // Update the giveaway document with the MP4 URL
      await getFirestore().collection("giveaways").doc(giveawayId).update({
        drawingVideoUrl: publicUrl,
      });

      console.log(`Converted ${filePath} -> ${mp4Path} for giveaway ${giveawayId}`);
    } catch (err) {
      console.error("Video conversion failed:", err);
    } finally {
      // Clean up temp files
      await unlink(inputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
    }
  },
);
