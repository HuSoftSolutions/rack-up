"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useAdminStatus } from "@/lib/auth/admin";

export function useRequireAuth(redirectTo = "/signin") {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace(redirectTo);
  }, [loading, redirectTo, router, user]);

  return { user, loading };
}

export function useRedirectIfAuthenticated(redirectTo = "/") {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) router.replace(redirectTo);
  }, [loading, redirectTo, router, user]);

  return { user, loading };
}

export function useRequireAdmin(redirectTo = "/profile") {
  const router = useRouter();
  const { user, loading: authLoading } = useRequireAuth("/signin");
  const { isAdmin, loading: adminLoading } = useAdminStatus();

  useEffect(() => {
    if (!authLoading && !adminLoading && user && !isAdmin) router.replace(redirectTo);
  }, [adminLoading, authLoading, isAdmin, redirectTo, router, user]);

  return { user, isAdmin, loading: authLoading || adminLoading };
}
