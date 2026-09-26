import { NextResponse } from "next/server";
import type { UserRecord } from "firebase-admin/auth";
import { adminAuth, adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toIso(value?: string | number | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);

    const authUsers: UserRecord[] = [];
    let pageToken: string | undefined;
    do {
      const page = await adminAuth.listUsers(1000, pageToken);
      authUsers.push(...page.users);
      pageToken = page.pageToken;
    } while (pageToken);
    const userProfiles = new Map<string, { fullName?: string | null; displayName?: string | null; phoneNumber?: string | null }>();
    const userIds = authUsers.map((user) => user.uid);
    for (let i = 0; i < userIds.length; i += 300) {
      const batch = userIds.slice(i, i + 300);
      const refs = batch.map((uid) => adminFirestore.collection("users").doc(uid));
      if (refs.length === 0) continue;
      const snaps = await adminFirestore.getAll(...refs);
      snaps.forEach((snap) => {
        const data = snap.data() as
          | { fullName?: string | null; displayName?: string | null; phoneNumber?: string | null }
          | undefined;
        if (!data) return;
        userProfiles.set(snap.id, data);
      });
    }

    const users = await Promise.all(
      authUsers.map(async (user) => {
        const adminDoc = await adminFirestore.collection("admins").doc(user.uid).get();
        const bizDoc = await adminFirestore.collection("business_admins").doc(user.uid).get();
        const bizData = bizDoc.data() as { businessId?: string; role?: string; locationIds?: string[] } | undefined;
        const profile = userProfiles.get(user.uid);
        return {
          uid: user.uid,
          email: user.email ?? null,
          displayName: profile?.fullName ?? profile?.displayName ?? user.displayName ?? null,
          phoneNumber: profile?.phoneNumber ?? user.phoneNumber ?? null,
          createdAt: toIso(user.metadata.creationTime),
          isAdmin: adminDoc.exists,
          businessAdmin: bizDoc.exists
            ? {
                businessId: bizData?.businessId ?? null,
                role: bizData?.role ?? null,
                locationIds: Array.isArray(bizData?.locationIds) ? bizData?.locationIds : [],
              }
            : null,
        };
      }),
    );

    users.sort((a, b) => {
      const newestFirst = (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
      return newestFirst || a.uid.localeCompare(b.uid);
    });

    return NextResponse.json({ users });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Failed to load users.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
