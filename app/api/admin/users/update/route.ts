import { NextResponse } from "next/server";
import { adminAuth, adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  uid: string;
  isAdmin?: boolean;
  businessId?: string | null;
  role?: "owner" | "staff";
  locationIds?: string[];
  displayName?: string | null;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const uid = body.uid?.trim();
    if (!uid) return badRequest("uid is required.");

    await adminAuth.getUser(uid);

    if (body.displayName !== undefined) {
      const name = body.displayName?.trim() ?? "";
      await adminAuth.updateUser(uid, { displayName: name.length > 0 ? name : null });
    }

    if (body.isAdmin !== undefined) {
      if (body.isAdmin) {
        await adminFirestore.collection("admins").doc(uid).set(
          {
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
      } else {
        await adminFirestore.collection("admins").doc(uid).delete();
      }
    }

    if (body.businessId !== undefined) {
      const businessId = body.businessId?.trim() || null;
      if (!businessId) {
        await adminFirestore.collection("business_admins").doc(uid).delete();
      } else {
        const role = body.role === "owner" ? "owner" : "staff";
        const locationIds = Array.isArray(body.locationIds)
          ? body.locationIds.map((id) => id.trim()).filter(Boolean)
          : [];
        if (role === "staff" && locationIds.length === 0) {
          return badRequest("Staff must be assigned at least one location.");
        }
        await adminFirestore.collection("business_admins").doc(uid).set(
          {
            businessId,
            role,
            locationIds: role === "owner" ? [] : locationIds,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
      }
    }

    const [adminDoc, bizDoc, user] = await Promise.all([
      adminFirestore.collection("admins").doc(uid).get(),
      adminFirestore.collection("business_admins").doc(uid).get(),
      adminAuth.getUser(uid),
    ]);

    return NextResponse.json({
      ok: true,
      user: {
        uid,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        isAdmin: adminDoc.exists,
        businessAdmin: bizDoc.exists
          ? {
              businessId: bizDoc.data()?.businessId ?? null,
              role: bizDoc.data()?.role ?? null,
              locationIds: Array.isArray(bizDoc.data()?.locationIds)
                ? bizDoc.data()?.locationIds
                : [],
            }
          : null,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Failed to update user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
