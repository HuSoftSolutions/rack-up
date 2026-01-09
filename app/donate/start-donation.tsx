"use client";

import { usePathname, useRouter } from "next/navigation";
import React, { useMemo, useState } from "react";
import { Badge } from "@/ui-kit/badge";
import { Button } from "@/ui-kit/button";
import { Field, Fieldset, Label } from "@/ui-kit/fieldset";
import { Heading } from "@/ui-kit/heading";
import { Input } from "@/ui-kit/input";
import { Text as UiText } from "@/ui-kit/text";
import PublicShell from "@/app/_components/PublicNav";
import { useAuth } from "@/lib/auth/AuthProvider";

import type { BusinessDoc, CauseDoc, LocationDoc } from "@/lib/types/business";

type PredefinedOption = NonNullable<CauseDoc["predefinedOptions"]>[number];

export default function DonateClient({
  business,
  cause,
  location,
}: {
  business: BusinessDoc & { id: string };
  cause: CauseDoc & { id: string };
  location: LocationDoc & { id: string };
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const redirectTarget = pathname || "/rewards";
  const [amount, setAmount] = useState(() =>
    cause.mode === "predefined" && cause.predefinedOptions?.[0]
      ? cause.predefinedOptions[0].amountCents / 100
      : 10,
  );
  const [selectedOption, setSelectedOption] = useState<PredefinedOption | null>(
    cause.mode === "predefined" && cause.predefinedOptions?.[0]
      ? cause.predefinedOptions[0]
      : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimatedPoints = useMemo(() => {
    if (cause.mode === "predefined") {
      return selectedOption?.points ?? 0;
    }
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const rate = cause.pointsPerDollar ?? 100;
    return Math.floor(amount * rate);
  }, [amount, cause.mode, cause.pointsPerDollar, selectedOption]);

  function sendToAuth() {
    const encoded = encodeURIComponent(redirectTarget);
    router.push(`/signin?redirect=${encoded}`);
  }

  async function startCheckout() {
    if (!user) {
      sendToAuth();
      return;
    }
    const minCents = cause.minAmountCents ?? 50;
    const maxCents = cause.maxAmountCents ?? 1000000;

    setSubmitting(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      let amountCents = Math.round(amount * 100);
      if (cause.mode === "predefined" && selectedOption) {
        amountCents = selectedOption.amountCents;
      }
      if (amountCents < minCents) {
        throw new Error(`Minimum donation is $${(minCents / 100).toFixed(2)} for this cause.`);
      }
      if (amountCents > maxCents) {
        throw new Error(`Maximum donation is $${(maxCents / 100).toFixed(0)} for this cause.`);
      }

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          amountCents,
          charityId: business.id,
          charityName: business.name,
          businessId: business.id,
          causeId: cause.id,
          causeTitle: cause.title,
          businessName: business.name,
          locationId: location.id,
          locationSlug: location.slug,
          pointsOverride: estimatedPoints,
        }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Failed to start checkout.");
      }
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <PublicShell contentClassName="max-w-3xl space-y-6">
      <div className="flex items-center gap-3 text-sm">
        <Button href="/rewards" plain>
          ← Back to rewards
        </Button>
        <Badge color="emerald">{business.name}</Badge>
      </div>

      <header className="space-y-3">
        <Badge color="emerald">Donate</Badge>
        <Heading level={1} className="text-3xl font-semibold tracking-tight text-white">
          {cause.title ?? `Support ${business.name}`}
        </Heading>
        {cause.description ? (
          <UiText className="max-w-2xl text-zinc-200">{cause.description}</UiText>
        ) : business.description ? (
          <UiText className="max-w-2xl text-zinc-200">{business.description}</UiText>
        ) : null}
        <UiText className="text-zinc-300">
          Donations earn RackUp points. You can redeem them at any partner location.
        </UiText>
        <UiText className="text-zinc-300">
          This link is for <span className="font-semibold text-white">{location.name}</span>.
        </UiText>
      </header>

      {cause.imageUrl ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-xl shadow-black/30 backdrop-blur">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cause.imageUrl}
            alt={cause.title ?? "Cause image"}
            className="mx-auto block w-full max-h-80 object-contain"
          />
        </div>
      ) : null}

      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/30 backdrop-blur">
        {cause.mode === "predefined" && cause.predefinedOptions ? (
          <div className="space-y-3">
            <Heading level={3} className="text-base font-semibold text-white">
              Choose an amount
            </Heading>
            <div className="flex flex-wrap gap-3">
              {cause.predefinedOptions.map((opt) => {
                const selected = selectedOption?.amountCents === opt.amountCents;
                return (
                  <Button
                    key={opt.amountCents}
                    type="button"
                    color="emerald"
                    outline={!selected}
                    className="w-full max-w-[180px]"
                    onClick={() => {
                      setSelectedOption(opt);
                      setAmount(opt.amountCents / 100);
                    }}
                  >
                    <span className="flex flex-col text-left">
                      <span className="text-lg font-semibold">
                        {opt.label ?? `$${(opt.amountCents / 100).toFixed(2)}`}
                      </span>
                      <span className="text-xs text-emerald-100">+ {opt.points} pts</span>
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        ) : (
          <Fieldset className="space-y-3">
            <Field>
              <Label className="text-white">Enter amount</Label>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-2xl font-semibold">$</span>
                <Input
                  type="number"
                  min={(cause.minAmountCents ?? 50) / 100}
                  max={(cause.maxAmountCents ?? 1000000) / 100}
                  step="0.5"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </div>
            </Field>
          </Fieldset>
        )}

        <div className="text-sm text-zinc-200">
          Estimated points: <span className="font-semibold">{estimatedPoints}</span>
        </div>
        {!loading && !user ? (
          <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            <div>Sign in or create an account to continue to checkout.</div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Button plain onClick={() => router.push(`/signin?redirect=${encodeURIComponent(redirectTarget)}`)}>
                Sign in
              </Button>
              <span className="opacity-70">•</span>
              <Button plain href={`/signup?redirect=${encodeURIComponent(redirectTarget)}`}>
                Create account
              </Button>
            </div>
            <div className="text-xs text-amber-100/80">You&apos;ll come right back here after signing in.</div>
          </div>
        ) : null}

        <div className="pt-2">
          <Button type="button" color="emerald" className="w-full" onClick={startCheckout} disabled={submitting || loading}>
            {submitting ? "Redirecting…" : "Donate now"}
          </Button>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}
      </div>
    </PublicShell>
  );
}
