"use client";

import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { firestore } from "@/lib/firebase/client";

type AdminStatus = {
  isAdmin: boolean;
  loading: boolean;
};

export function useAdminStatus(): AdminStatus {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let canceled = false;

    async function run() {
      if (authLoading) return;
      if (!user) {
        if (!canceled) {
          setIsAdmin(false);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const snapshot = await getDoc(doc(firestore, "admins", user.uid));
        if (!canceled) setIsAdmin(snapshot.exists());
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    void run();
    return () => {
      canceled = true;
    };
  }, [authLoading, user]);

  return { isAdmin, loading: authLoading || loading };
}

