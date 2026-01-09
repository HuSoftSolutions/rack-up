import { NextResponse } from "next/server";
import { adminAuth, adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  email: string;
  role?: "owner" | "staff";
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  const { businessId: rawBusinessId } = await context.params;
  const businessId = rawBusinessId?.trim();
  if (!businessId) return badRequest("businessId is required.");

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const email = body.email?.trim().toLowerCase();
  const role = body.role === "owner" ? "owner" : "staff";
  if (!email) return badRequest("email is required.");

  try {
    await requireAdmin(request);
    const user = await adminAuth.getUserByEmail(email);
    const membership = { businessId, role };
    await adminFirestore.collection("business_admins").doc(user.uid).set(membership);
    return NextResponse.json({ ok: true, uid: user.uid, email: user.email, membership });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (typeof (err as { code?: string })?.code === "string" && (err as { code?: string }).code === "auth/user-not-found") {
      return badRequest("No user exists with that email.");
    }
    const message = err instanceof Error ? err.message : "Failed to add staff.";
    return serverError(message);
  }
}
