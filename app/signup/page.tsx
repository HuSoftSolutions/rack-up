import { Suspense } from "react";
import SignUpClient from "./signup-client";

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center px-6 py-16 text-sm text-zinc-500">
          Loading signup...
        </div>
      }
    >
      <SignUpClient />
    </Suspense>
  );
}
