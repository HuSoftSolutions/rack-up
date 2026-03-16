import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import { getReferralConfig, normalizeReferralConfig } from "@/lib/server/referrals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const config = await getReferralConfig();
    return NextResponse.json({ config });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to load referral config.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    const body = (await request.json()) as unknown;
    const config = normalizeReferralConfig(body);
    await adminFirestore.collection("platform_config").doc("referrals").set(
      {
        ...config,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.message.includes("Admin") ? 403 : 401;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : "Failed to update referral config.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
