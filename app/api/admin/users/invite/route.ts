import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { adminAuth, adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import { sendInviteEmail } from "@/lib/server/sendgrid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  email: string;
  displayName?: string;
  isAdmin?: boolean;
  businessId?: string | null;
  role?: "owner" | "staff";
  sendLink?: boolean;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isAuthErrorCode(err: unknown, code: string) {
  return typeof (err as { code?: string })?.code === "string" && (err as { code?: string }).code === code;
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

    const email = body.email?.trim().toLowerCase();
    if (!email) return badRequest("email is required.");

    const displayName = body.displayName?.trim();
    const isAdmin = body.isAdmin === true;
    const businessId = body.businessId?.trim() || null;
    const role = body.role === "owner" ? "owner" : "staff";
    const sendLink = body.sendLink !== false;

    let user = null;
    try {
      user = await adminAuth.getUserByEmail(email);
    } catch (err) {
      if (!isAuthErrorCode(err, "auth/user-not-found")) {
        throw err;
      }
    }

    if (user) {
      return badRequest("User already exists. Use Manage to update roles or affiliations.");
    }

    const password = randomBytes(16).toString("hex");
    user = await adminAuth.createUser({
      email,
      password,
      displayName: displayName || undefined,
    });

    if (isAdmin) {
      await adminFirestore.collection("admins").doc(user.uid).set(
        {
          invitedBy: ctx.uid,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    }

    if (businessId) {
      await adminFirestore.collection("business_admins").doc(user.uid).set(
        {
          businessId,
          role,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    }

    const [adminDoc, bizDoc] = await Promise.all([
      adminFirestore.collection("admins").doc(user.uid).get(),
      adminFirestore.collection("business_admins").doc(user.uid).get(),
    ]);

    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0] ?? "";
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0] ?? "https";
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ??
      request.headers.get("origin") ??
      request.headers.get("x-forwarded-origin") ??
      (forwardedHost ? `${forwardedProto}://${forwardedHost}` : "");
    const defaultBase = "http://127.0.0.1:3000";
    const actionLink = sendLink
      ? await adminAuth.generatePasswordResetLink(email, {
          url: origin ? `${origin.replace(/\/$/, "")}/invite` : `${defaultBase}/invite`,
          handleCodeInApp: true,
        })
      : null;
    const inviteLink =
      sendLink && actionLink
        ? (() => {
            try {
              const parsed = new URL(actionLink);
              const code = parsed.searchParams.get("oobCode");
              if (!code) return actionLink;
              const base = origin ? origin.replace(/\/$/, "") : defaultBase;
              return `${base}/invite?oobCode=${encodeURIComponent(code)}`;
            } catch {
              return actionLink;
            }
          })()
        : null;

    if (sendLink && inviteLink) {
      const from = process.env.SENDGRID_FROM_EMAIL;
      if (!from) {
        return NextResponse.json(
          { error: "Missing SENDGRID_FROM_EMAIL for invite email." },
          { status: 500 },
        );
      }
      let businessName: string | null = null;
      if (businessId) {
        const bizSnap = await adminFirestore.collection("businesses").doc(businessId).get();
        businessName = (bizSnap.data() as { name?: string } | undefined)?.name ?? businessId;
      }
      await sendInviteEmail({
        to: email,
        from,
        actionLink: inviteLink,
        displayName: user.displayName ?? null,
        inviterEmail: ctx.email ?? null,
        businessName,
        role: businessId ? role : null,
      });
    }

    return NextResponse.json({
      status: "created",
      actionLink: inviteLink,
      user: {
        uid: user.uid,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        isAdmin: adminDoc.exists,
        businessAdmin: bizDoc.exists
          ? { businessId: bizDoc.data()?.businessId ?? null, role: bizDoc.data()?.role ?? null }
          : null,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Failed to invite user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
