import { Suspense } from "react";
import ForgotPasswordClient from "./forgot-password-client";

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center px-6 py-16 text-sm text-zinc-500">
          Loading...
        </div>
      }
    >
      <ForgotPasswordClient />
    </Suspense>
  );
}
