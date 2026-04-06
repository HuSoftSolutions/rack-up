const { setGlobalOptions } = require("firebase-functions");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { initializeApp } = require("firebase-admin/app");
const { getStorage } = require("firebase-admin/storage");
const { getFirestore } = require("firebase-admin/firestore");
const { execFile } = require("child_process");
const { unlink, mkdtemp, stat } = require("fs/promises");
const { randomUUID } = require("crypto");
const { join } = require("path");
const { tmpdir } = require("os");

initializeApp();
setGlobalOptions({ maxInstances: 10 });

exports.convertDrawingVideo = onObjectFinalized(
  {
    memory: "8GiB",
    timeoutSeconds: 540,
    cpu: 4,
  },
  async (event) => {
    const filePath = event.data.name;
    const contentType = event.data.contentType;
    const fileSize = event.data.size;

    if (!filePath.startsWith("giveaway-videos/") || !contentType.startsWith("video/webm")) {
      return;
    }
    if (filePath.includes("/converted/")) {
      return;
    }

    const parts = filePath.split("/");
    const giveawayId = parts[1];
    if (!giveawayId || giveawayId === "unknown") {
      console.log("Skipping video with unknown giveawayId:", filePath);
      return;
    }

    console.log(`Starting conversion: ${filePath} (${(fileSize / 1024 / 1024).toFixed(1)} MB) for giveaway ${giveawayId}`);

    const bucket = getStorage().bucket(event.data.bucket);
    const dir = await mkdtemp(join(tmpdir(), "convert-"));
    const inputPath = join(dir, "input.webm");
    const outputPath = join(dir, "output.mp4");

    try {
      // Step 1: Download
      console.log("Downloading WebM...");
      await bucket.file(filePath).download({ destination: inputPath });
      const inputStat = await stat(inputPath);
      console.log(`Downloaded: ${(inputStat.size / 1024 / 1024).toFixed(1)} MB`);

      // Step 2: Convert
      console.log("Starting FFmpeg conversion...");
      await new Promise((resolve, reject) => {
        const proc = execFile(
          "ffmpeg",
          [
            "-i", inputPath,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "28",
            "-vf", "scale='min(1280,iw)':-2",
            "-threads", "2",
            "-movflags", "+faststart",
            "-y",
            outputPath,
          ],
          { timeout: 480_000, maxBuffer: 10 * 1024 * 1024 },
          (err) => (err ? reject(err) : resolve()),
        );
        proc.stderr.on("data", (data) => {
          const line = data.toString().trim();
          if (line.includes("frame=") || line.includes("time=")) {
            console.log(`FFmpeg: ${line.substring(0, 200)}`);
          }
        });
      });

      const outputStat = await stat(outputPath);
      console.log(`Conversion done: ${(outputStat.size / 1024 / 1024).toFixed(1)} MB`);

      // Step 3: Upload MP4
      console.log("Uploading MP4...");
      const mp4Path = `giveaway-videos/${giveawayId}/converted/${parts[2].replace(".webm", ".mp4")}`;
      await bucket.upload(outputPath, {
        destination: mp4Path,
        metadata: {
          contentType: "video/mp4",
          cacheControl: "public,max-age=31536000",
        },
      });
      console.log("Upload complete");

      // Step 4: Generate download URL
      const token = randomUUID();
      const mp4File = bucket.file(mp4Path);
      await mp4File.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
      const encodedPath = encodeURIComponent(mp4Path);
      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${event.data.bucket}/o/${encodedPath}?alt=media&token=${token}`;

      // Step 5: Update Firestore
      await getFirestore().collection("giveaways").doc(giveawayId).update({
        drawingVideoUrl: publicUrl,
      });

      console.log(`Done: ${filePath} -> ${mp4Path} for giveaway ${giveawayId}`);
    } catch (err) {
      console.error(`Conversion failed at ${filePath}:`, err?.message || err);
      if (err?.stderr) console.error("FFmpeg stderr:", err.stderr.substring(0, 500));
    } finally {
      await unlink(inputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
    }
  },
);
