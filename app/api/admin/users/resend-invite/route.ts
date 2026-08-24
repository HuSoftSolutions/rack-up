import { NextResponse } from "next/server";
import { adminAuth, adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";
import { generatePasswordResetPageLink, resolveOrigin } from "@/lib/server/action-links";
import { sendInviteEmail } from "@/lib/server/email";

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

    const inviteLink = await generatePasswordResetPageLink(
      user.email,
      resolveOrigin(request),
      "/invite",
    );

    const warnings: string[] = [];
    const from = process.env.RESEND_FROM_EMAIL;
    if (!from) {
      warnings.push("Invite email not sent: missing RESEND_FROM_EMAIL.");
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
