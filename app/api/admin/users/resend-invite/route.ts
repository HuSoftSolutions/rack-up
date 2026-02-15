import { NextResponse } from "next/server";
import { adminAuth, adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import { sendInviteEmail } from "@/lib/server/sendgrid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  uid?: string;
  email?: string;
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
    const email = body.email?.trim().toLowerCase();
    if (!uid && !email) return badRequest("uid or email is required.");

    const user = uid ? await adminAuth.getUser(uid) : await adminAuth.getUserByEmail(email!);
    if (!user.email) return badRequest("User is missing an email address.");

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
    const actionLink = await adminAuth.generatePasswordResetLink(user.email, {
      url: origin ? `${origin.replace(/\/$/, "")}/invite` : `${defaultBase}/invite`,
      handleCodeInApp: true,
    });
    const inviteLink = (() => {
      try {
        const parsed = new URL(actionLink);
        const code = parsed.searchParams.get("oobCode");
        if (!code) return actionLink;
        const base = origin ? origin.replace(/\/$/, "") : defaultBase;
        return `${base}/invite?oobCode=${encodeURIComponent(code)}`;
      } catch {
        return actionLink;
      }
    })();

    const warnings: string[] = [];
    const from = process.env.SENDGRID_FROM_EMAIL;
    if (!from) {
      warnings.push("Invite email not sent: missing SENDGRID_FROM_EMAIL.");
    } else {
      let businessName: string | null = null;
      const businessId = bizDoc.data()?.businessId as string | undefined;
      const role = bizDoc.data()?.role as string | undefined;
      if (businessId) {
        const bizSnap = await adminFirestore.collection("businesses").doc(businessId).get();
        businessName = (bizSnap.data() as { name?: string } | undefined)?.name ?? businessId;
      }
      try {
        await sendInviteEmail({
          to: user.email,
          from,
          actionLink: inviteLink,
          displayName: user.displayName ?? null,
          inviterEmail: ctx.email ?? null,
          businessName,
          role: businessId ? (role === "owner" ? "owner" : "staff") : null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "SendGrid error.";
        warnings.push(`Invite email failed: ${message}`);
      }
    }

    return NextResponse.json({
      actionLink: inviteLink,
      emailSent: warnings.length === 0,
      warnings: warnings.length > 0 ? warnings : undefined,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName ?? null,
        isAdmin: adminDoc.exists,
        businessAdmin: bizDoc.exists
          ? {
              businessId: bizDoc.data()?.businessId ?? null,
              role: bizDoc.data()?.role ?? null,
              locationIds: Array.isArray(bizDoc.data()?.locationIds)
                ? bizDoc.data()?.locationIds
                : [],
            }
          : null,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Failed to resend invite.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
