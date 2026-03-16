import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { uid } = await requireUser(request);
    const [inviteSnap, claimsSnap] = await Promise.all([
      adminFirestore
        .collection("referral_invites")
        .where("inviterUserId", "==", uid)
        .where("active", "==", true)
        .limit(1)
        .get(),
      adminFirestore.collection("referral_claims").where("inviterUserId", "==", uid).get(),
    ]);

    const inviteCode = !inviteSnap.empty ? inviteSnap.docs[0].id : null;
    const invitedUsers = claimsSnap.size;
    const inviterPointsAwarded = claimsSnap.docs.reduce((sum, doc) => {
      const data = doc.data() as { inviterPointsAwarded?: number };
      return sum + (typeof data.inviterPointsAwarded === "number" ? data.inviterPointsAwarded : 0);
    }, 0);

    return NextResponse.json({
      inviteCode,
      invitedUsers,
      inviterPointsAwarded,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Failed to load referral stats.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
