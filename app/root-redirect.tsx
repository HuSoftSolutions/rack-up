"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { fetchRedirectTarget } from "@/lib/auth/redirectTarget";

/**
 * On pages where we want immediate redirect for signed-in users (home),
 * call the server to resolve the correct target and navigate without flashing UI.
 */
export function ClientRedirectOnAuth() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    (async () => {
      const target = (await fetchRedirectTarget()) ?? "/profile";
      router.replace(target);
    })();
  }, [loading, router, user]);

  return null;
}
