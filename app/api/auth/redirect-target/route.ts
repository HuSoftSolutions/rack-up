import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { uid } = await requireUser(request);

    const adminDoc = await adminFirestore.collection("admins").doc(uid).get();
    if (adminDoc.exists) {
      return NextResponse.json({ redirectTo: "/admin", role: "admin" });
    }

    const bizDoc = await adminFirestore.collection("business_admins").doc(uid).get();
    if (bizDoc.exists) {
      const data = bizDoc.data() as { businessId?: string; role?: string } | undefined;
      const businessId = data?.businessId;
      const role = data?.role ?? "staff";
      if (businessId) {
        return NextResponse.json({
          redirectTo: `/biz/${businessId}`,
          role,
          businessId,
        });
      }
    }

    return NextResponse.json({ redirectTo: "/profile", role: "user" });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to determine redirect target." },
      { status: 500 },
    );
  }
}
