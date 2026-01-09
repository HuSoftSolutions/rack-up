import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(request: Request) {
  try {
    const { uid } = await requireUser(request);
    const points = await getUserPointsBalance(uid);
    return NextResponse.json({ points });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch points." }, { status: 500 });
  }
}
