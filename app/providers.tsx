"use client";

import React from "react";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import PhoneEligibilityPrompt from "@/app/_components/PhoneEligibilityPrompt";
import { ToastProvider } from "@/app/_components/ToastProvider";
import ClientErrorHandlers from "@/app/_components/ClientErrorHandlers";
import GlobalErrorBoundary from "@/app/_components/GlobalErrorBoundary";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <ClientErrorHandlers />
        <GlobalErrorBoundary>{children}</GlobalErrorBoundary>
        <PhoneEligibilityPrompt />
      </ToastProvider>
    </AuthProvider>
  );
}
