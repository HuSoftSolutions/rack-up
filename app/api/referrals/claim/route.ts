import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/lib/server/auth";
import { getReferralConfig } from "@/lib/server/referrals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  code?: string;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const { uid } = await requireUser(request);
    const body = (await request.json()) as Body;
    const code = (body.code ?? "").trim().toUpperCase();
    if (!code) return badRequest("Referral code is required.");

    const config = await getReferralConfig();
    if (!config.enabled) return badRequest("Referral invites are currently disabled.");

    const inviteRef = adminFirestore.collection("referral_invites").doc(code);
    const globalClaimRef = adminFirestore.collection("referral_user_claims").doc(uid);
    const now = Timestamp.now();
    let result: { inviterPoints: number; invitedPoints: number } | null = null;

    await adminFirestore.runTransaction(async (tx) => {
      const [inviteSnap, globalClaimSnap] = await Promise.all([
        tx.get(inviteRef),
        tx.get(globalClaimRef),
      ]);
      if (!inviteSnap.exists) throw new Error("Invalid referral code.");
      const invite = inviteSnap.data() as { inviterUserId?: string; active?: boolean } | undefined;
      const inviterUserId = invite?.inviterUserId ?? "";
      if (!inviterUserId) throw new Error("Referral invite is invalid.");
      if (invite?.active === false) throw new Error("Referral invite is inactive.");
      if (inviterUserId === uid) throw new Error("You cannot use your own referral invite.");
      if (globalClaimSnap.exists) throw new Error("Referral reward already claimed for this account.");

      const claimRef = adminFirestore.collection("referral_claims").doc(`${code}_${uid}`);
      const existingSpecific = await tx.get(claimRef);
      if (existingSpecific.exists) throw new Error("Referral reward already claimed.");

      tx.set(globalClaimRef, {
        inviteeUserId: uid,
        inviterUserId,
        code,
        claimedAt: now,
      });
      tx.set(claimRef, {
        code,
        inviterUserId,
        inviteeUserId: uid,
        inviterPointsAwarded: config.inviterPoints,
        inviteePointsAwarded: config.invitedPoints,
        createdAt: now,
      });

      if (config.inviterPoints > 0) {
        tx.set(adminFirestore.collection("transactions").doc(), {
          type: "referral_invite",
          status: "completed",
          pointsDelta: config.inviterPoints,
          amountCents: null,
          userId: inviterUserId,
          referredUserId: uid,
          referralCode: code,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (config.invitedPoints > 0) {
        tx.set(adminFirestore.collection("transactions").doc(), {
          type: "referral_signup",
          status: "completed",
          pointsDelta: config.invitedPoints,
          amountCents: null,
          userId: uid,
          inviterUserId,
          referralCode: code,
          createdAt: now,
          updatedAt: now,
        });
      }

      result = {
        inviterPoints: config.inviterPoints,
        invitedPoints: config.invitedPoints,
      };
    });

    return NextResponse.json({ ok: true, ...(result ?? { inviterPoints: 0, invitedPoints: 0 }) });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Failed to claim referral reward.";
    const lowered = message.toLowerCase();
    const status = lowered.includes("already") || lowered.includes("invalid") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
