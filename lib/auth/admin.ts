"use client";

import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { normalizeFirestoreListenerError } from "@/lib/client/firestore-error";
import { firestore } from "@/lib/firebase/client";

type AdminStatus = {
  isAdmin: boolean;
  loading: boolean;
};

export function useAdminStatus(): AdminStatus {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
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
          setIsAdmin(false);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const snapshot = await getDoc(doc(firestore, "admins", user.uid));
        if (!canceled) setIsAdmin(snapshot.exists());
      } catch (err) {
        const normalized = normalizeFirestoreListenerError(err, "Failed to verify admin access.");
        console.warn("useAdminStatus lookup failed:", normalized.rawMessage);
        // Preserve last known role on transient failures (common on mobile resume).
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    void run();
    return () => {
      canceled = true;
    };
  }, [authLoading, resumeKey, user]);

  return { isAdmin, loading: authLoading || loading };
}
