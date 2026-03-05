"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";

export default function LandingEligibilityCta() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <Link
      className="inline-flex h-11 items-center justify-center rounded-full border border-white/30 px-6 text-sm font-semibold text-white transition hover:bg-white/10"
      href={user ? "/profile" : "/signup"}
    >
      {user ? "Go To Profile" : "Sign Up Today"}
    </Link>
  );
}
