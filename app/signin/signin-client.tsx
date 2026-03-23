"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Badge } from "@/ui-kit/badge";
import { Button } from "@/ui-kit/button";
import { Field, Fieldset, Label } from "@/ui-kit/fieldset";
import { Heading } from "@/ui-kit/heading";
import { Input } from "@/ui-kit/input";
import { Text, TextLink } from "@/ui-kit/text";
import { firebaseAuth } from "@/lib/firebase/client";
import { fetchRedirectTarget } from "@/lib/auth/redirectTarget";
import { useAuth } from "@/lib/auth/AuthProvider";
import { normalizeClientRequestError } from "@/lib/client/request-error";
import PublicShell from "@/app/_components/PublicNav";

export default function SignInClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const redirectParam = useMemo(
    () => (redirect && redirect.startsWith("/") ? redirect : "/"),
    [redirect],
  );
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    // Already signed in: send to server-chosen target or fallback.
    (async () => {
      const target =
        redirectParam && redirectParam !== "/"
          ? redirectParam
          : (await fetchRedirectTarget()) ?? "/";
      router.replace(target);
    })();
  }, [loading, redirectParam, router, user]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      const target =
        redirectParam && redirectParam !== "/"
          ? redirectParam
          : (await fetchRedirectTarget()) ?? "/";
      router.replace(target);
    } catch (err) {
      setError(normalizeClientRequestError(err, "Sign in failed."));
      setSubmitting(false);
    }
  }

  return (
    <PublicShell contentClassName="flex min-h-[70vh] items-center justify-center py-10">
      <main className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/30 backdrop-blur">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image
            src="/RackUp-01.svg"
            alt="Rack Up"
            width={160}
            height={48}
            className="h-12 w-auto"
          />
          <Badge color="emerald">Welcome back</Badge>
          <Heading level={1} className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Sign in to your account
          </Heading>
          <Text className="text-sm text-zinc-200">
            Access your points, support, and business tools in one place.
          </Text>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <Fieldset className="space-y-4">
            <Field>
              <Label className="text-white">Email</Label>
              <Input
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>

            <Field>
              <Label className="text-white">Password</Label>
              <Input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
          </Fieldset>

          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <Button type="submit" color="emerald" className="w-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-zinc-300">
          Need an account?{" "}
          <TextLink
            className="font-semibold text-emerald-200"
            href={
              redirectParam && redirectParam !== "/"
                ? `/signup?redirect=${encodeURIComponent(redirectParam)}`
                : "/signup"
            }
          >
            Create one
          </TextLink>
          .
        </div>
      </main>
    </PublicShell>
  );
}
