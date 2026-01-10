"use client";

import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { Badge } from "@/ui-kit/badge";
import { Button } from "@/ui-kit/button";
import { Field, Fieldset, Label } from "@/ui-kit/fieldset";
import { Heading } from "@/ui-kit/heading";
import { Input } from "@/ui-kit/input";
import { Text, TextLink } from "@/ui-kit/text";
import { firebaseAuth } from "@/lib/firebase/client";
import { fetchRedirectTarget } from "@/lib/auth/redirectTarget";
import { useAuth } from "@/lib/auth/AuthProvider";
import PublicShell from "@/app/_components/PublicNav";

export default function SignUpClient() {
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
    (async () => {
      const target = (await fetchRedirectTarget()) ?? redirectParam;
      router.replace(target);
    })();
  }, [loading, redirectParam, router, user]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      const target = (await fetchRedirectTarget()) ?? redirectParam;
      router.replace(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
      setSubmitting(false);
    }
  }

  return (
    <PublicShell contentClassName="max-w-5xl space-y-10">
      <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr] lg:items-start">
        <div className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/30">
          <Badge color="emerald">Join Rack Up</Badge>
          <Heading level={1} className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Create your account to start donating and earning rewards
          </Heading>
          <Text className="text-zinc-200">
            Secure hosted checkout, points for every donation, and perks at partner businesses.
          </Text>
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-emerald-100">
            <div className="text-xs uppercase tracking-wide text-emerald-200/80">
              Already have an account?
            </div>
            <div className="mt-1">
              <TextLink
                className="font-semibold text-emerald-200"
                href={
                  redirectParam && redirectParam !== "/"
                    ? `/signin?redirect=${encodeURIComponent(redirectParam)}`
                    : "/signin"
                }
              >
                Sign in here
              </TextLink>
              .
            </div>
          </div>
        </div>

        <main className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl shadow-black/30 backdrop-blur">
          <div className="mb-4 space-y-1">
            <Badge color="emerald">Secure signup</Badge>
            <Heading level={2} className="text-lg font-semibold text-white">
              Use your email to get started
            </Heading>
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
                  autoComplete="new-password"
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
              {submitting ? "Creating…" : "Create account"}
            </Button>
          </form>
        </main>
      </div>
    </PublicShell>
  );
}
