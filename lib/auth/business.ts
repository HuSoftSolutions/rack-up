"use client";

import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
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
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    void run();
    return () => {
      canceled = true;
    };
  }, [authLoading, user]);

  const hasAccess =
    !!membership &&
    (!!expectedBusinessId ? membership.businessId === expectedBusinessId : true) &&
    (membership.role === "owner" || (membership.locationIds?.length ?? 0) > 0);

  return { hasAccess, loading: authLoading || loading, membership };
}
