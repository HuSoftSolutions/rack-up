"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
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

export default function SignUpClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const referralCode = searchParams.get("ref");
  const redirectParam = useMemo(
    () => (redirect && redirect.startsWith("/") ? redirect : "/"),
    [redirect],
  );
  const { user, loading } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function appendQueryParams(path: string, params: Record<string, string>) {
    const [base, queryString = ""] = path.split("?", 2);
    const search = new URLSearchParams(queryString);
    Object.entries(params).forEach(([key, value]) => {
      search.set(key, value);
    });
    const nextQuery = search.toString();
    return nextQuery ? `${base}?${nextQuery}` : base;
  }

  useEffect(() => {
    if (loading) return;
    if (submitting) return;
    if (!user) return;
    (async () => {
      const target =
        redirectParam && redirectParam !== "/"
          ? redirectParam
          : (await fetchRedirectTarget()) ?? "/";
      router.replace(target);
    })();
  }, [loading, redirectParam, router, submitting, user]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      await updateProfile(cred.user, { displayName: fullName.trim() });
      const idToken = await cred.user.getIdToken();
      const profileRes = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ displayName: fullName, phoneNumber }),
      });
      if (!profileRes.ok) {
        const json = (await profileRes.json()) as { error?: string };
        throw new Error(json.error ?? "Unable to save profile.");
      }
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(
            "profileBootstrapUntil",
            String(Date.now() + 20_000),
          );
        } catch {
          // Ignore storage failures on restricted browsers.
        }
      }

      let awardedInvitedPoints = 0;
      const normalizedReferralCode = referralCode?.trim();
      if (normalizedReferralCode) {
        try {
          const claimRes = await fetch("/api/referrals/claim", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ code: normalizedReferralCode }),
          });
          const claimJson = (await claimRes.json()) as {
            ok?: boolean;
            invitedPoints?: number;
          };
          if (claimRes.ok && claimJson.ok && typeof claimJson.invitedPoints === "number") {
            awardedInvitedPoints = Math.max(0, Math.floor(claimJson.invitedPoints));
          }
        } catch {
          // Non-blocking: account creation should not fail on referral claim errors.
        }
      }
      const target =
        redirectParam && redirectParam !== "/"
          ? redirectParam
          : (await fetchRedirectTarget()) ?? "/";
      const targetWithReferral =
        awardedInvitedPoints > 0
          ? appendQueryParams(target, {
              referralSignup: "1",
              referralPoints: String(awardedInvitedPoints),
            })
          : target;
      router.replace(targetWithReferral);
    } catch (err) {
      setError(normalizeClientRequestError(err, "Sign up failed."));
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
          <Badge color="emerald">Join Rack Up</Badge>
          <Heading level={1} className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Create your account
          </Heading>
          <Text className="text-sm text-zinc-200">
            Sign up to start donating, earning points, and unlocking rewards.
          </Text>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <Fieldset className="space-y-4">
            <Field>
              <Label className="text-white">Full name</Label>
              <Input
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </Field>

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

            <Field>
              <Label className="text-white">Phone number</Label>
              <Input
                autoComplete="tel"
                inputMode="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
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

        <div className="mt-6 text-center text-sm text-zinc-300">
          Already have an account?{" "}
          <TextLink
            className="font-semibold text-emerald-200"
            href={
              redirectParam && redirectParam !== "/"
                ? `/signin?redirect=${encodeURIComponent(redirectParam)}`
                : "/signin"
            }
          >
            Sign in
          </TextLink>
          .
        </div>
      </main>
    </PublicShell>
  );
}
