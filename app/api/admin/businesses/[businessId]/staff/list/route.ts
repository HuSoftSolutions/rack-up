import { NextResponse } from "next/server";
import { adminAuth, adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const { businessId: rawBusinessId } = await context.params;
  const businessId = rawBusinessId?.trim();
  if (!businessId) {
    return NextResponse.json({ error: "businessId is required." }, { status: 400 });
  }

  try {
    await requireAdmin(request);
    const snapshot = await adminFirestore
      .collection("business_admins")
      .where("businessId", "==", businessId)
      .get();

    const members = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data() as { role?: string };
        const uid = doc.id;
        try {
          const user = await adminAuth.getUser(uid);
          return { uid, email: user.email ?? null, role: data.role ?? "staff" };
        } catch {
          return { uid, email: null, role: data.role ?? "staff" };
        }
      }),
    );

    return NextResponse.json({ members });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Failed to list staff.";
    return serverError(message);
  }
}
