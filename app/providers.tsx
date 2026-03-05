"use client";

import React from "react";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import PhoneEligibilityPrompt from "@/app/_components/PhoneEligibilityPrompt";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <PhoneEligibilityPrompt />
    </AuthProvider>
  );
}
