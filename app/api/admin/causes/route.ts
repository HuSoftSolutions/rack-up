import { NextResponse } from "next/server";
import { adminFirestore, firebaseAdminApp } from "@/lib/firebase/admin";
import { getStorage } from "firebase-admin/storage";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import { createCauseQrToken } from "@/lib/server/qr-access";
import type { CauseDoc } from "@/lib/types/business";
import { slugify } from "@/lib/utils/slugify";
import { Timestamp } from "firebase-admin/firestore";

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

function parseStoragePath(url: string): { bucket: string; path: string } | null {
  if (url.startsWith("gs://")) {
    const [, rest] = url.split("gs://");
    const [bucket, ...segments] = rest.split("/");
    return { bucket, path: segments.join("/") };
  }
  if (url.includes("firebasestorage.googleapis.com")) {
    const match = url.match(/\/b\/([^/]+)\/o\/([^?]+)/);
    if (match) return { bucket: match[1], path: decodeURIComponent(match[2]) };
  }
  if (url.includes("storage.googleapis.com")) {
    const match = url.match(/https?:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)/);
    if (match) return { bucket: match[1], path: decodeURIComponent(match[2].split("?")[0]) };
  }
  return null;
}

async function uploadImage(file: File) {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || firebaseAdminApp.options.storageBucket;
  if (!bucketName) {
    throw new Error("Storage bucket not configured. Set FIREBASE_STORAGE_BUCKET.");
  }
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `cause-images/global/${Date.now()}.${ext}`;
  const bucket = getStorage(firebaseAdminApp).bucket(bucketName);
  const ref = bucket.file(path);
  const buffer = Buffer.from(await file.arrayBuffer());
  await ref.save(buffer, { contentType: file.type, resumable: false, metadata: { cacheControl: "public,max-age=31536000" } });
  // Generate a signed URL for read access; avoids relying on bucket-wide public access.
  const [signedUrl] = await ref.getSignedUrl({
    action: "read",
    expires: Date.now() + 1000 * 60 * 60 * 24 * 365, // ~1 year
  });
  return signedUrl;
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const [causesSnap, linksSnap, businessSnap] = await Promise.all([
      adminFirestore.collection("causes").orderBy("createdAt", "desc").get(),
      adminFirestore.collectionGroup("cause_links").get(),
      adminFirestore.collection("businesses").get(),
    ]);

    const businesses = new Map(
      businessSnap.docs.map((b) => [
        b.id,
        { id: b.id, name: (b.data() as { name?: string }).name ?? b.id, slug: (b.data() as { slug?: string }).slug ?? b.id },
      ]),
    );

    const causes = await Promise.all(
      causesSnap.docs.map(async (doc) => {
        const data = doc.data() as CauseDoc;
        const links = linksSnap.docs.filter((l) => l.id === doc.id);
        const businessLinks = links.map((l) => {
          const businessId = l.ref.parent.parent?.id ?? "";
          const b = businesses.get(businessId);
          const businessSlug = b?.slug ?? businessId;
          const linkData = l.data() as { locationIds?: string[] };
          return {
            businessId: b?.id ?? "",
            businessName: b?.name ?? businessId,
            businessSlug,
            locations: (linkData.locationIds ?? []).map((locId) => ({
              id: locId,
              slug: locId,
              name: locId,
              qrToken: createCauseQrToken({
                businessSlug,
                causeSlug: doc.id,
                locationSlug: locId,
              }),
            })),
          };
        });

        let imageUrl = data.imageUrl ?? null;
        if (imageUrl && !imageUrl.includes("signature=")) {
          const parsed = parseStoragePath(imageUrl);
          if (parsed) {
            try {
              const bucket = getStorage(firebaseAdminApp).bucket(parsed.bucket);
              const [signed] = await bucket.file(parsed.path).getSignedUrl({
                action: "read",
                expires: Date.now() + 1000 * 60 * 60 * 24 * 365,
              });
              imageUrl = signed;
            } catch {
              // leave as-is if signing fails
            }
          }
        }

        return {
          id: doc.id,
          ...data,
          imageUrl,
          businessLinks,
          createdAt: toIso(data.createdAt),
          updatedAt: toIso(data.updatedAt),
        };
      }),
    );
    return NextResponse.json({ causes });
  } catch (err) {
    console.error(err);
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    return NextResponse.json({ error: "Failed to load causes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const form = await request.formData();
    const title = (form.get("title") as string | null)?.trim();
    const description = (form.get("description") as string | null)?.trim() ?? "";
    const mode = (form.get("mode") as "custom" | "predefined" | null) ?? "custom";
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

    const pointsPerDollar = form.get("pointsPerDollar");
    const minAmountCents = form.get("minAmountCents");
    const maxAmountCents = form.get("maxAmountCents");
    const predefinedOptions = form.get("predefinedOptions")
      ? (JSON.parse(form.get("predefinedOptions") as string) as CauseDoc["predefinedOptions"])
      : [];
    const imageFile = form.get("image") instanceof File ? (form.get("image") as File) : null;

    const slug = slugify(title).toLowerCase();
    const ref = adminFirestore.collection("causes").doc(slug);
    const now = Timestamp.now();
    let imageUrl: string | undefined;
    if (imageFile && imageFile.size > 0) {
      imageUrl = await uploadImage(imageFile);
    }

    const payload: CauseDoc = {
      title,
      description,
      slug,
      mode,
      businessId: "",
      ...(mode === "custom"
        ? {
            pointsPerDollar: Number(pointsPerDollar || 0),
            minAmountCents: Number(minAmountCents) || undefined,
            maxAmountCents: Number(maxAmountCents) || undefined,
          }
        : {}),
      ...(mode === "predefined" ? { predefinedOptions: predefinedOptions ?? [] } : {}),
      locationIds: [],
      active: true,
      imageUrl,
      createdAt: now,
      updatedAt: now,
    };

    await ref.set(payload, { merge: true });
    return NextResponse.json({ ok: true, id: ref.id, slug });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error(err);
    const message =
      err instanceof Error && err.message.includes("Storage bucket not configured")
        ? err.message
        : "Failed to save cause.";
    const status = message.includes("Storage bucket") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    const form = await request.formData();
    const causeId = (form.get("id") as string | null)?.trim();
    if (!causeId) return NextResponse.json({ error: "id required" }, { status: 400 });
    const title = (form.get("title") as string | null)?.trim();
    const description = (form.get("description") as string | null)?.trim() ?? "";
    const mode = (form.get("mode") as "custom" | "predefined" | null) ?? "custom";
    const pointsPerDollar = form.get("pointsPerDollar");
    const minAmountCents = form.get("minAmountCents");
    const maxAmountCents = form.get("maxAmountCents");
    const predefinedOptions = form.get("predefinedOptions")
      ? (JSON.parse(form.get("predefinedOptions") as string) as CauseDoc["predefinedOptions"])
      : [];
    const active = form.get("active") ? form.get("active") === "true" : true;
    const imageFile = form.get("image") instanceof File ? (form.get("image") as File) : null;

    const ref = adminFirestore.collection("causes").doc(causeId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Cause not found." }, { status: 404 });

    let imageUrl = snap.data()?.imageUrl ?? null;
    if (imageFile && imageFile.size > 0) {
      imageUrl = await uploadImage(imageFile);
    }

    const parseOptionalNumber = (value: FormDataEntryValue | null) => {
      if (typeof value !== "string") return undefined;
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const num = Number(trimmed);
      return Number.isFinite(num) ? num : undefined;
    };
    const pointsPerDollarValue =
      typeof pointsPerDollar === "string" && pointsPerDollar.trim()
        ? Number(pointsPerDollar)
        : 0;

    const payload: Partial<CauseDoc> = {
      title: title ?? snap.data()?.title,
      description,
      mode,
      pointsPerDollar: mode === "custom" ? pointsPerDollarValue : undefined,
      minAmountCents: mode === "custom" ? parseOptionalNumber(minAmountCents) : undefined,
      maxAmountCents: mode === "custom" ? parseOptionalNumber(maxAmountCents) : undefined,
      predefinedOptions: mode === "predefined" ? predefinedOptions ?? [] : [],
      active,
      imageUrl,
      updatedAt: Timestamp.now(),
    };

    await ref.set(payload, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error(err);
    const message =
      err instanceof Error && err.message.includes("Storage bucket not configured")
        ? err.message
        : "Failed to update cause.";
    const status = message.includes("Storage bucket") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin(request);
    const body = (await request.json()) as { id?: string };
    const id = body.id?.trim();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Delete cause
    await adminFirestore.collection("causes").doc(id).delete();

    // Remove any business links that reference this cause.
    const linkSnap = await adminFirestore.collectionGroup("cause_links").get();
    const batch = adminFirestore.batch();
    const linksToDelete = linkSnap.docs.filter(
      (doc) => doc.id === id || (doc.data() as { causeId?: string }).causeId === id,
    );
    linksToDelete.forEach((doc) => batch.delete(doc.ref));
    if (linksToDelete.length > 0) {
      await batch.commit();
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to delete cause." }, { status: 500 });
  }
}
