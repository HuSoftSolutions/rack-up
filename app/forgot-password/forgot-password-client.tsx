"use client";

import Image from "next/image";
import React, { useState } from "react";
import { Badge } from "@/ui-kit/badge";
import { Button } from "@/ui-kit/button";
import { Field, Fieldset, Label } from "@/ui-kit/fieldset";
import { Heading } from "@/ui-kit/heading";
import { Input } from "@/ui-kit/input";
import { Text, TextLink } from "@/ui-kit/text";
import PublicShell from "@/app/_components/PublicNav";

export default function ForgotPasswordClient() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to send reset email.");
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset email.");
    } finally {
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
          <Badge color="emerald">Password reset</Badge>
          <Heading level={1} className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Forgot your password?
          </Heading>
          <Text className="text-sm text-zinc-200">
            Enter your email and we&apos;ll send you a link to reset it.
          </Text>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              If an account exists for <span className="font-semibold">{email.trim()}</span>, a
              password reset link is on its way. Check your inbox (and spam folder).
            </div>
            <div className="text-center text-sm text-zinc-300">
              <TextLink className="font-semibold text-emerald-200" href="/signin">
                Back to sign in
              </TextLink>
            </div>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <Fieldset className="space-y-4">
              <Field>
                <Label className="text-white">Email</Label>
                <Input
                  autoComplete="email"
                  inputMode="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
              {submitting ? "Sending…" : "Send reset link"}
            </Button>

            <div className="text-center text-sm text-zinc-300">
              Remembered it?{" "}
              <TextLink className="font-semibold text-emerald-200" href="/signin">
                Sign in
              </TextLink>
              .
            </div>
          </form>
        )}
      </main>
    </PublicShell>
  );
}
