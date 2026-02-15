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
  locationIds?: string[];
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
    const locationIds = Array.isArray(body.locationIds)
      ? body.locationIds.map((id) => id.trim()).filter(Boolean)
      : [];
    const sendLink = body.sendLink !== false;

    if (businessId && role === "staff" && locationIds.length === 0) {
      return badRequest("Staff must be assigned at least one location.");
    }

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
    const createdDocs: Array<{ collection: string; id: string }> = [];
    let createdUserId: string | null = null;
    const warnings: string[] = [];
    try {
      user = await adminAuth.createUser({
        email,
        password,
        displayName: displayName || undefined,
      });
      createdUserId = user.uid;

      if (isAdmin) {
        await adminFirestore.collection("admins").doc(user.uid).set(
          {
            invitedBy: ctx.uid,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
        createdDocs.push({ collection: "admins", id: user.uid });
      }

      if (businessId) {
        await adminFirestore.collection("business_admins").doc(user.uid).set(
          {
            businessId,
            role,
            locationIds: role === "owner" ? [] : locationIds,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
        createdDocs.push({ collection: "business_admins", id: user.uid });
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
          warnings.push("Invite email not sent: missing SENDGRID_FROM_EMAIL.");
        } else {
          let businessName: string | null = null;
          if (businessId) {
            const bizSnap = await adminFirestore.collection("businesses").doc(businessId).get();
            businessName = (bizSnap.data() as { name?: string } | undefined)?.name ?? businessId;
          }
          try {
            await sendInviteEmail({
              to: email,
              from,
              actionLink: inviteLink,
              displayName: user.displayName ?? null,
              inviterEmail: ctx.email ?? null,
              businessName,
              role: businessId ? role : null,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : "SendGrid error.";
            warnings.push(`Invite email failed: ${message}`);
          }
        }
      }

      return NextResponse.json({
        status: "created",
        actionLink: inviteLink,
        emailSent: sendLink ? warnings.length === 0 : false,
        warnings: warnings.length > 0 ? warnings : undefined,
        user: {
          uid: user.uid,
          email: user.email ?? null,
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
      if (createdUserId) {
        await Promise.allSettled(
          createdDocs.map((doc) => adminFirestore.collection(doc.collection).doc(doc.id).delete()),
        );
        await adminAuth.deleteUser(createdUserId);
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Failed to invite user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
