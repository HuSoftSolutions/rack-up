import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MarkUsedBody = {
  issueId: string;
  code: string;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request) {
  let body: MarkUsedBody;
  try {
    body = (await request.json()) as MarkUsedBody;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const issueId = body.issueId?.trim();
  const code = body.code?.trim();
  if (!issueId) return badRequest("issueId is required.");
  if (!code) return badRequest("code is required.");

  try {
    const { uid } = await requireUser(request);
    const issueRef = adminFirestore.collection("reward_issues").doc(issueId);
    const snapshot = await issueRef.get();
    if (!snapshot.exists) return notFound("Reward issue not found.");

    const data = snapshot.data();
    if (!data) return serverError("Malformed reward issue.");
    if (data.userId !== uid) return unauthorized("Not your reward.");
    if (data.code !== code) return badRequest("Code does not match.");
    if (data.status !== "issued") return badRequest("Reward already used or expired.");

    await issueRef.update({
      status: "used",
      usedAt: Timestamp.now(),
    });

    return NextResponse.json({ message: "Reward marked as used." });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    return serverError("Failed to mark reward as used.");
  }
}
