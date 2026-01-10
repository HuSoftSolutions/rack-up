import { Suspense } from "react";
import SignInClient from "./signin-client";

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center px-6 py-16 text-sm text-zinc-500">
          Loading sign-in...
        </div>
      }
    >
      <SignInClient />
    </Suspense>
  );
}
