import { adminAuth, adminFirestore } from "@/lib/firebase/admin";
import type { BusinessAdminMembership } from "@/lib/types/rackup";

export type AuthContext = {
  uid: string;
  email?: string;
};

export class AuthError extends Error {}

export async function requireUser(request: Request): Promise<AuthContext> {
  const ctx = await getOptionalUser(request);
  if (!ctx) {
    throw new AuthError("Missing Authorization header. Include Bearer <idToken>.");
  }
  return ctx;
}

export async function getOptionalUser(request: Request): Promise<AuthContext | null> {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const [, token] = header.split(" ");
  if (!token) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email ?? undefined };
  } catch {
    return null;
  }
}

export async function requireAdmin(request: Request): Promise<AuthContext> {
  const ctx = await requireUser(request);
  const snapshot = await adminFirestore.collection("admins").doc(ctx.uid).get();
  if (!snapshot.exists) {
    throw new AuthError("Admin privileges required.");
  }
  return ctx;
}

export async function getBusinessMembership(uid: string): Promise<BusinessAdminMembership | null> {
  const snapshot = await adminFirestore.collection("business_admins").doc(uid).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() as Partial<BusinessAdminMembership> | undefined;
  if (!data?.businessId || !data.role) return null;
  return { businessId: data.businessId, role: data.role };
}

export async function requireBusinessAccess(
  request: Request,
  businessId: string,
): Promise<AuthContext & { membership: BusinessAdminMembership }> {
  const ctx = await requireUser(request);

  // Global admins are allowed.
  const adminSnap = await adminFirestore.collection("admins").doc(ctx.uid).get();
  if (adminSnap.exists) {
    return { ...ctx, membership: { businessId, role: "owner" } };
  }

  const membership = await getBusinessMembership(ctx.uid);
  if (!membership) {
    throw new AuthError("Business access required.");
  }
  if (membership.businessId !== businessId) {
    throw new AuthError("Access denied for this business.");
  }

  return { ...ctx, membership };
}

export async function requireBusinessOwner(
  request: Request,
  businessId: string,
): Promise<AuthContext & { membership: BusinessAdminMembership }> {
  const ctx = await requireBusinessAccess(request, businessId);
  if (ctx.membership.role !== "owner") {
    // Global admins are treated as owners above.
    throw new AuthError("Owner privileges required for this business.");
  }
  return ctx;
}
