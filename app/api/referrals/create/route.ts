import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/lib/server/auth";
import { createUniqueReferralCode, getReferralConfig } from "@/lib/server/referrals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { uid } = await requireUser(request);
    const config = await getReferralConfig();
    if (!config.enabled) {
      return NextResponse.json({ error: "Referral invites are currently disabled." }, { status: 403 });
    }

    const existingSnap = await adminFirestore
      .collection("referral_invites")
      .where("inviterUserId", "==", uid)
      .where("active", "==", true)
      .limit(1)
      .get();

    let code: string;
    if (!existingSnap.empty) {
      code = existingSnap.docs[0].id;
    } else {
      code = await createUniqueReferralCode();
      await adminFirestore.collection("referral_invites").doc(code).set({
        code,
        inviterUserId: uid,
        active: true,
        createdAt: Timestamp.now(),
      });
    }

    const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const base = origin.replace(/\/$/, "");
    const inviteLink = `${base}/signup?ref=${encodeURIComponent(code)}`;

    return NextResponse.json({
      ok: true,
      code,
      inviteLink,
      config: {
        enabled: config.enabled,
        inviterPoints: config.inviterPoints,
        invitedPoints: config.invitedPoints,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Failed to create referral invite.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
