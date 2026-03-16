import { adminAuth, adminFirestore } from "@/lib/firebase/admin";

export type UserIdentity = {
  displayName: string | null;
  email: string | null;
  phoneNumber: string | null;
};

type UserDocProfile = {
  fullName?: string | null;
  displayName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function loadUserIdentities(
  userIdsInput: Array<string | null | undefined>,
): Promise<Map<string, UserIdentity>> {
  const userIds = Array.from(new Set(userIdsInput.filter((value): value is string => Boolean(value))));
  const identities = new Map<string, UserIdentity>();
  if (userIds.length === 0) return identities;

  for (const batch of chunk(userIds, 300)) {
    const refs = batch.map((uid) => adminFirestore.collection("users").doc(uid));
    if (refs.length === 0) continue;
    const snaps = await adminFirestore.getAll(...refs);
    for (const snap of snaps) {
      const data = (snap.data() as UserDocProfile | undefined) ?? undefined;
      if (!data) continue;
      identities.set(snap.id, {
        displayName: data.fullName ?? data.displayName ?? null,
        email: data.email ?? null,
        phoneNumber: data.phoneNumber ?? null,
      });
    }
  }

  for (const batch of chunk(userIds, 100)) {
    const result = await adminAuth.getUsers(batch.map((uid) => ({ uid })));
    for (const user of result.users) {
      const existing = identities.get(user.uid);
      identities.set(user.uid, {
        displayName: existing?.displayName ?? user.displayName ?? null,
        email: existing?.email ?? user.email ?? null,
        phoneNumber: existing?.phoneNumber ?? user.phoneNumber ?? null,
      });
    }
  }

  return identities;
}
