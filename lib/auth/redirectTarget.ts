import { firebaseAuth } from "@/lib/firebase/client";

export async function fetchRedirectTarget(): Promise<string | null> {
  try {
    const currentUser = firebaseAuth.currentUser;
    if (!currentUser) return null;
    const idToken = await currentUser.getIdToken();
    const res = await fetch("/api/auth/redirect-target", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const json = (await res.json()) as { redirectTo?: string; error?: string };
    if (!res.ok) throw new Error(json.error ?? "Failed to resolve redirect.");
    return json.redirectTo ?? null;
  } catch {
    return null;
  }
}
