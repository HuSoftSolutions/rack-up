"use client";

import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { normalizeFirestoreListenerError } from "@/lib/client/firestore-error";
import { firestore } from "@/lib/firebase/client";
import type { BusinessAdminMembership } from "@/lib/types/rackup";

type BusinessAccess = {
  hasAccess: boolean;
  loading: boolean;
  membership: BusinessAdminMembership | null;
};

export function useBusinessAccess(expectedBusinessId?: string): BusinessAccess {
  const { user, loading: authLoading } = useAuth();
  const [membership, setMembership] = useState<BusinessAdminMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [resumeKey, setResumeKey] = useState(0);

  useEffect(() => {
    const onResumeSignal = () => {
      setResumeKey((value) => value + 1);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") onResumeSignal();
    };

    window.addEventListener("focus", onResumeSignal);
    window.addEventListener("online", onResumeSignal);
    window.addEventListener("pageshow", onResumeSignal);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onResumeSignal);
      window.removeEventListener("online", onResumeSignal);
      window.removeEventListener("pageshow", onResumeSignal);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let canceled = false;

    async function run() {
      if (authLoading) return;
      if (!user) {
        if (!canceled) {
          setMembership(null);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      try {
        const snap = await getDoc(doc(firestore, "business_admins", user.uid));
        if (!snap.exists()) {
          if (!canceled) setMembership(null);
          return;
        }
        const data = snap.data() as BusinessAdminMembership;
        if (!canceled) setMembership(data);
      } catch (err) {
        const normalized = normalizeFirestoreListenerError(err, "Failed to verify business access.");
        console.warn("useBusinessAccess lookup failed:", normalized.rawMessage);
        // Preserve last known membership on transient failures (common on mobile resume).
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    void run();
    return () => {
      canceled = true;
    };
  }, [authLoading, resumeKey, user]);

  const hasAccess =
    !!membership &&
    (!!expectedBusinessId ? membership.businessId === expectedBusinessId : true) &&
    (membership.role === "owner" || (membership.locationIds?.length ?? 0) > 0);

  return { hasAccess, loading: authLoading || loading, membership };
}
