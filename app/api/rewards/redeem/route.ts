import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/lib/server/auth";
import type { RewardIssue } from "@/lib/types/rackup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RedeemBody = {
  dealId: string;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

async function getUserPointsBalance(uid: string): Promise<number> {
  const snapshot = await adminFirestore
    .collection("transactions")
    .where("userId", "==", uid)
    .where("status", "==", "completed")
    .get();

  return snapshot.docs.reduce((sum, doc) => {
    const data = doc.data();
    const delta = typeof data.pointsDelta === "number" ? data.pointsDelta : 0;
    return sum + delta;
  }, 0);
}

function generateCode(length = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function POST(request: Request) {
  let body: RedeemBody;
  try {
    body = (await request.json()) as RedeemBody;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const dealId = body.dealId?.trim();
  if (!dealId) return badRequest("dealId is required.");

  try {
    const { uid, email } = await requireUser(request);
    const userRecord = await adminAuth.getUser(uid);
    const userName = userRecord.displayName ?? undefined;
    const userEmail = email ?? userRecord.email ?? undefined;
    const dealSnap = await adminFirestore.collection("deals").doc(dealId).get();
    if (!dealSnap.exists) return badRequest("Unknown deal.");
    const deal = dealSnap.data();
    if (!deal?.active) return badRequest("Deal is not available.");
    const businessId = deal.businessId as string | undefined;
    const dealPointCost = typeof deal.pointCost === "number" ? deal.pointCost : 0;
    const balance = await getUserPointsBalance(uid);
    if (balance < dealPointCost) {
      return badRequest("Insufficient points to redeem this reward.");
    }

    const now = Timestamp.now();
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 72 * 60 * 60 * 1000));
    const code = generateCode();

    const issueRef = adminFirestore.collection("reward_issues").doc();
    const txRef = adminFirestore.collection("transactions").doc();

    const displayPayload: RewardIssue["displayPayload"] = {
      title: (deal.title as string | undefined) ?? "Reward",
      businessName: (deal.businessName as string | undefined) ?? businessId ?? "Partner",
      dealType: (deal.type as RewardIssue["displayPayload"]["dealType"]) ?? "amount_off",
      locations: Array.isArray(deal.locations)
        ? (deal.locations as Array<{ label?: string } | string>)
            .map((loc) => (typeof loc === "string" ? loc : loc.label))
            .filter((label): label is string => typeof label === "string" && label.length > 0)
            .map((label) => ({ label }))
        : [],
      expiresAt: expiresAt.toDate().toISOString(),
      code,
      ...(deal.terms ? { terms: deal.terms as string } : {}),
    };

    await adminFirestore.runTransaction(async (tx) => {
      tx.set(txRef, {
        type: "redemption",
        status: "completed",
        pointsDelta: -dealPointCost,
        userId: uid,
        dealId,
        businessId: businessId ?? null,
        createdAt: now,
      });

      tx.set(issueRef, {
        userId: uid,
        businessId: businessId ?? null,
        dealId,
        code,
        status: "issued",
        issuedAt: now,
        expiresAt,
        displayPayload,
        email: userEmail ?? null,
        userEmail: userEmail ?? null,
        userName: userName ?? null,
      });
    });

    return NextResponse.json({
      issueId: issueRef.id,
      code,
      expiresAt: displayPayload.expiresAt,
      message: "Reward issued.",
      pointsRemaining: balance - dealPointCost,
    });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("Failed to redeem reward.", err);
    const message = err instanceof Error ? err.message : "Failed to redeem reward.";
    return serverError(message);
  }
}
