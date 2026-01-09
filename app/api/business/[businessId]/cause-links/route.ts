import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireBusinessAccess } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const { businessId: rawBusinessId } = await context.params;
  const businessId = rawBusinessId?.trim();
  if (!businessId) return NextResponse.json({ error: "businessId is required." }, { status: 400 });

  try {
    await requireBusinessAccess(request, businessId);
    const [causeSnap, linkSnap] = await Promise.all([
      adminFirestore.collection("causes").get(),
      adminFirestore.collection("businesses").doc(businessId).collection("cause_links").get(),
    ]);

    const links = new Map(
      linkSnap.docs.map((d) => [d.id, d.data() as { locationIds?: string[] }]),
    );
    const causes = causeSnap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const link = links.get(d.id);
      return {
        id: d.id,
        ...data,
        linked: Boolean(link),
        selectedLocationIds: link?.locationIds ?? [],
      };
    });

    return NextResponse.json({ causes });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Access denied") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to load cause links.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const { businessId: rawBusinessId } = await context.params;
  const businessId = rawBusinessId?.trim();
  if (!businessId) return NextResponse.json({ error: "businessId is required." }, { status: 400 });

  try {
    await requireBusinessAccess(request, businessId);
    const body = (await request.json()) as { causeId?: string; locationIds?: string[] };
    if (!body.causeId) return NextResponse.json({ error: "causeId required" }, { status: 400 });

    const causeRef = adminFirestore.collection("causes").doc(body.causeId);
    const exists = await causeRef.get();
    if (!exists.exists) {
      return NextResponse.json({ error: "Cause not found." }, { status: 404 });
    }

    await adminFirestore
      .collection("businesses")
      .doc(businessId)
      .collection("cause_links")
      .doc(body.causeId)
      .set(
        {
          causeId: body.causeId,
          locationIds: Array.isArray(body.locationIds) ? body.locationIds : [],
          updatedAt: new Date(),
        },
        { merge: true },
      );

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Access denied") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to save cause link.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const { businessId: rawBusinessId } = await context.params;
  const businessId = rawBusinessId?.trim();
  if (!businessId) return NextResponse.json({ error: "businessId is required." }, { status: 400 });

  try {
    await requireBusinessAccess(request, businessId);
    const body = (await request.json()) as { causeId?: string };
    if (!body.causeId) return NextResponse.json({ error: "causeId required" }, { status: 400 });

    await adminFirestore
      .collection("businesses")
      .doc(businessId)
      .collection("cause_links")
      .doc(body.causeId)
      .delete();

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Access denied") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to remove cause link.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
