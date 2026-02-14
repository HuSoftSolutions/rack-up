"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { BusinessAdminMembership } from "@/lib/types/rackup";

export type BizLocationOption = { id: string; name?: string; label?: string };

type LocationScopeValue = {
  businessId: string;
  role: "owner" | "staff" | "admin";
  locations: BizLocationOption[];
  loading: boolean;
  locationId: string | null;
  setLocationId: (value: string | null) => void;
};

const LocationScopeContext = createContext<LocationScopeValue | null>(null);

function storageKey(businessId: string) {
  return `rackup:bizLocation:${businessId}`;
}

export function LocationScopeProvider({
  businessId,
  membership,
  isAdmin,
  children,
}: {
  businessId: string;
  membership: BusinessAdminMembership | null;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [locations, setLocations] = useState<BizLocationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationId, setLocationId] = useState<string | null>(null);

  const role = useMemo<"owner" | "staff" | "admin">(() => {
    if (isAdmin) return "admin";
    return membership?.role ?? "staff";
  }, [isAdmin, membership?.role]);

  useEffect(() => {
    if (!user || !businessId) return;
    let canceled = false;
    async function loadLocations() {
      setLoading(true);
      try {
        const currentUser = user;
        if (!currentUser) return;
        const token = await currentUser.getIdToken();
        const res = await fetch(`/api/business/${businessId}/locations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json()) as { locations?: BizLocationOption[]; error?: string };
        if (!res.ok || !json.locations) {
          throw new Error(json.error ?? "Failed to load locations.");
        }
        if (!canceled) {
          setLocations(json.locations);
        }
      } catch {
        if (!canceled) setLocations([]);
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void loadLocations();
    return () => {
      canceled = true;
    };
  }, [businessId, user]);

  useEffect(() => {
    if (!businessId) return;
    if (loading) return;
    const key = storageKey(businessId);
    const stored = (() => {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    })();

    if (role === "owner" || role === "admin") {
      if (stored && (stored === "__all__" || locations.some((l) => l.id === stored))) {
        setLocationId(stored === "__all__" ? null : stored);
      } else {
        setLocationId(null);
      }
      return;
    }

    if (locations.length === 0) {
      setLocationId(null);
      return;
    }

    if (stored && locations.some((l) => l.id === stored)) {
      setLocationId(stored);
      return;
    }
    setLocationId(locations[0].id);
  }, [businessId, loading, locations, role]);

  useEffect(() => {
    if (!businessId) return;
    const key = storageKey(businessId);
    try {
      if (locationId) {
        sessionStorage.setItem(key, locationId);
      } else if (role === "owner" || role === "admin") {
        sessionStorage.setItem(key, "__all__");
      }
    } catch {
      // ignore storage issues
    }
  }, [businessId, locationId, role]);

  const value = useMemo<LocationScopeValue>(
    () => ({
      businessId,
      role,
      locations,
      loading,
      locationId,
      setLocationId,
    }),
    [businessId, role, locations, loading, locationId],
  );

  return <LocationScopeContext.Provider value={value}>{children}</LocationScopeContext.Provider>;
}

export function useLocationScope() {
  const ctx = useContext(LocationScopeContext);
  if (!ctx) throw new Error("useLocationScope must be used within LocationScopeProvider");
  return ctx;
}
