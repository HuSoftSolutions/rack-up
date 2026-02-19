import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireBusinessAccess } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ businessId: string; dealId: string }> },
) {
  const { businessId, dealId } = await context.params;
  if (!businessId) return badRequest("businessId is required.");
  if (!dealId) return badRequest("dealId is required.");

  try {
    await requireBusinessAccess(request, businessId);

    const docRef = adminFirestore.collection("deals").doc(dealId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) return notFound("Deal not found.");

    const data = snapshot.data();
    const dealBusinessId = data?.businessId ?? null;
    if (dealBusinessId && dealBusinessId !== businessId) {
      return NextResponse.json({ error: "Access denied for this offer." }, { status: 403 });
    }

    await docRef.delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Access denied") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to delete deal.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
