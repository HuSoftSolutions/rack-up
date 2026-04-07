const { setGlobalOptions } = require("firebase-functions");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { initializeApp } = require("firebase-admin/app");
const { getStorage } = require("firebase-admin/storage");
const { getFirestore } = require("firebase-admin/firestore");
const { spawn } = require("child_process");
const { unlink, mkdtemp, stat } = require("fs/promises");
const { randomUUID } = require("crypto");
const { join } = require("path");
const { tmpdir } = require("os");
const { createWriteStream } = require("fs");

initializeApp();
setGlobalOptions({ maxInstances: 10 });

exports.convertDrawingVideo = onObjectFinalized(
  {
    memory: "2GiB",
    timeoutSeconds: 540,
    cpu: 2,
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
    // FFmpeg needs a temp file for faststart, then we rename
    const tempOutputPath = join(dir, "output_temp.mp4");
    const outputPath = join(dir, "output.mp4");

    try {
      // Step 1: Stream download to disk (not into memory)
      console.log("Downloading WebM to disk...");
      await new Promise((resolve, reject) => {
        const writeStream = createWriteStream(inputPath);
        bucket.file(filePath).createReadStream()
          .on("error", reject)
          .pipe(writeStream)
          .on("error", reject)
          .on("finish", resolve);
      });
      const inputStat = await stat(inputPath);
      console.log(`Downloaded: ${(inputStat.size / 1024 / 1024).toFixed(1)} MB`);

      // Step 2: Convert with FFmpeg using spawn (no buffering)
      // Two-pass approach: first create MP4 without faststart, then add it
      console.log("Starting FFmpeg conversion...");
      await new Promise((resolve, reject) => {
        const proc = spawn("ffmpeg", [
          "-i", inputPath,
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-crf", "28",
          "-pix_fmt", "yuv420p",
          "-vf", "scale='min(1280,iw)':-2",
          "-threads", "1",
          "-an",
          "-y",
          tempOutputPath,
        ]);

        let lastLog = Date.now();
        proc.stderr.on("data", (data) => {
          const now = Date.now();
          if (now - lastLog > 5000) {
            const line = data.toString().trim();
            if (line.includes("frame=") || line.includes("time=")) {
              console.log(`FFmpeg: ${line.substring(0, 200)}`);
            }
            lastLog = now;
          }
        });

        proc.on("error", reject);
        proc.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg exited with code ${code}`));
        });
      });

      // Add faststart (moves moov atom to beginning for streaming)
      console.log("Adding faststart...");
      await new Promise((resolve, reject) => {
        const proc = spawn("ffmpeg", [
          "-i", tempOutputPath,
          "-c", "copy",
          "-movflags", "+faststart",
          "-y",
          outputPath,
        ]);
        proc.on("error", reject);
        proc.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg faststart exited with code ${code}`));
        });
      });
      await unlink(tempOutputPath).catch(() => {});

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
    } finally {
      await unlink(inputPath).catch(() => {});
      await unlink(tempOutputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
    }
  },
);
