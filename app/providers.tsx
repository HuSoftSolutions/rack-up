"use client";

import React from "react";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import PhoneEligibilityPrompt from "@/app/_components/PhoneEligibilityPrompt";
import { ToastProvider } from "@/app/_components/ToastProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        {children}
        <PhoneEligibilityPrompt />
      </ToastProvider>
    </AuthProvider>
  );
}
