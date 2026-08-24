import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { adminAuth, adminFirestore } from "@/lib/firebase/admin";
import { generatePasswordResetPageLink, resolveOrigin } from "@/lib/server/action-links";
import { sendPasswordResetEmail } from "@/lib/server/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  email?: string;
};

const EMAIL_LIMIT = 5;
const IP_LIMIT = 20;
const WINDOW_MS = 60 * 60 * 1000;

// Fixed-window rate limit backed by Firestore, keyed by a hashed identifier so
// no raw emails or IPs land in document ids. Returns false when the caller is
// over the limit for the current window.
async function consumeRateLimit(key: string, limit: number): Promise<boolean> {
  const id = createHash("sha256").update(key).digest("hex");
  const ref = adminFirestore.collection("password_reset_requests").doc(id);
  const now = Date.now();
  return adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as { count?: number; windowStartMs?: number } | undefined;
    const windowStartMs = data?.windowStartMs ?? 0;
    const inWindow = now - windowStartMs < WINDOW_MS;
    const count = inWindow ? (data?.count ?? 0) : 0;
    if (count >= limit) return false;
    tx.set(ref, {
      count: count + 1,
      windowStartMs: inWindow ? windowStartMs : now,
      expiresAt: new Date(now + WINDOW_MS * 2),
    });
    return true;
  });
}

function isAuthErrorCode(err: unknown, code: string) {
  return typeof (err as { code?: string })?.code === "string" && (err as { code?: string }).code === code;
}

export async function POST(request: Request) {
  // Always respond with the same body whether or not the email belongs to an
  // account, so this endpoint can't be used to probe for registered users.
  const genericResponse = NextResponse.json({ status: "sent" });

  try {
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const email = body.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const [emailAllowed, ipAllowed] = await Promise.all([
      consumeRateLimit(`email:${email}`, EMAIL_LIMIT),
      consumeRateLimit(`ip:${ip}`, IP_LIMIT),
    ]);
    if (!emailAllowed || !ipAllowed) {
      // Silently drop: revealing the limit would also reveal request history.
      return genericResponse;
    }

    try {
      await adminAuth.getUserByEmail(email);
    } catch (err) {
      if (isAuthErrorCode(err, "auth/user-not-found")) {
        return genericResponse;
      }
      throw err;
    }

    const from = process.env.RESEND_FROM_EMAIL;
    if (!from) {
      console.error("Password reset email not sent: missing RESEND_FROM_EMAIL.");
      return NextResponse.json({ error: "Email is not configured." }, { status: 500 });
    }

    const origin = resolveOrigin(request);
    const resetLink = await generatePasswordResetPageLink(email, origin, "/reset-password");
    await sendPasswordResetEmail({ to: email, from, actionLink: resetLink });

    return genericResponse;
  } catch (err) {
    console.error("Password reset request failed:", err);
    return NextResponse.json({ error: "Failed to send reset email." }, { status: 500 });
  }
}
