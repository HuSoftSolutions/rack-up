import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  uid: string;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAdmin(request);
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const uid = body.uid?.trim();
    if (!uid) return badRequest("uid is required.");

    try {
      await adminAuth.getUser(uid);
    } catch (err) {
      if (typeof (err as { code?: string })?.code === "string" && (err as { code?: string }).code === "auth/user-not-found") {
        return badRequest("User not found.");
      }
      throw err;
    }
    const token = await adminAuth.createCustomToken(uid, {
      assumedBy: ctx.uid,
      assumedAt: new Date().toISOString(),
    });

    return NextResponse.json({ token });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Failed to create assume token.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
