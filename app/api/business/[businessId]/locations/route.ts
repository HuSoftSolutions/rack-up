import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireBusinessAccess } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await context.params;
  if (!businessId) return badRequest("businessId is required.");

  try {
    await requireBusinessAccess(request, businessId);
    const snap = await adminFirestore
      .collection("businesses")
      .doc(businessId)
      .collection("locations")
      .get();
    const locations = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: (data.name as string | undefined) ?? doc.id,
        label: (data.label as string | undefined) ?? data.name ?? doc.id,
      };
    });
    return NextResponse.json({ locations });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Access denied") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to load locations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
