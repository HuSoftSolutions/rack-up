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
import GiveawayProgressCard from "@/app/_components/GiveawayProgressCard";
import { useAuth } from "@/lib/auth/AuthProvider";

import type { BusinessDoc, CauseDoc, LocationDoc } from "@/lib/types/business";

type PointsConfig = {
  mode: "custom" | "predefined";
  pointsPerDollar?: number;
  predefinedOptions?: { amountCents: number; points: number; label?: string }[];
};

type PredefinedOption = NonNullable<CauseDoc["predefinedOptions"]>[number];

export default function DonateClient({
  business,
  cause,
  location,
  scanSource,
  pointsConfig,
  qrToken,
}: {
  business: Pick<BusinessDoc, "name" | "slug" | "description"> & { id: string };
  cause: CauseDoc & { id: string };
  location?: (LocationDoc & { id: string }) | null;
  scanSource: "in_person" | "remote";
  pointsConfig: PointsConfig;
  qrToken?: string | null;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const redirectTarget = pathname || "/rewards";
  const [amount, setAmount] = useState(() =>
    pointsConfig.mode === "predefined" && pointsConfig.predefinedOptions?.[0]
      ? pointsConfig.predefinedOptions[0].amountCents / 100
      : 10,
  );
  const [selectedOption, setSelectedOption] = useState<PredefinedOption | null>(
    pointsConfig.mode === "predefined" && pointsConfig.predefinedOptions?.[0]
      ? pointsConfig.predefinedOptions[0]
      : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimatedPoints = useMemo(() => {
    if (pointsConfig.mode === "predefined") {
      return selectedOption?.points ?? 0;
    }
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const rate = pointsConfig.pointsPerDollar ?? 100;
    return Math.floor(amount * rate);
  }, [amount, pointsConfig.mode, pointsConfig.pointsPerDollar, selectedOption]);

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
      if (pointsConfig.mode === "predefined" && selectedOption) {
        amountCents = selectedOption.amountCents;
      }
      if (amountCents < minCents) {
        throw new Error(`Minimum support is $${(minCents / 100).toFixed(2)} for this cause.`);
      }
      if (amountCents > maxCents) {
        throw new Error(`Maximum support is $${(maxCents / 100).toFixed(0)} for this cause.`);
      }

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          amountCents,
          charityId: scanSource === "remote" ? cause.id : business.id,
          charityName: scanSource === "remote" ? (cause.title ?? "Remote support") : business.name,
          ...(scanSource === "in_person" ? { businessId: business.id } : {}),
          causeId: cause.id,
          causeTitle: cause.title,
          ...(scanSource === "in_person" ? { businessName: business.name } : {}),
          ...(location?.id ? { locationId: location.id } : {}),
          ...(location?.slug ? { locationSlug: location.slug } : {}),
          qrToken: qrToken ?? undefined,
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
        <Badge color="emerald">Support</Badge>
        <Heading level={1} className="text-3xl font-semibold tracking-tight text-white">
          {cause.title ?? `Support ${business.name}`}
        </Heading>
        {cause.description ? (
          <UiText className="max-w-2xl text-zinc-200">{cause.description}</UiText>
        ) : business.description ? (
          <UiText className="max-w-2xl text-zinc-200">{business.description}</UiText>
        ) : null}
        <UiText className="text-zinc-300">
          Support earns RackUp points. You can redeem them at any partner location.
        </UiText>
        {location?.name ? (
          <UiText className="text-zinc-300">
            This link is for <span className="font-semibold text-white">{location.name}</span>.
          </UiText>
        ) : (
          <UiText className="text-zinc-300">
            This is a remote support link.
          </UiText>
        )}
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
        {pointsConfig.mode === "predefined" && pointsConfig.predefinedOptions ? (
          <div className="space-y-3">
            <Heading level={3} className="text-base font-semibold text-white">
              Choose an amount
            </Heading>
            <div className="flex flex-wrap gap-3">
              {pointsConfig.predefinedOptions.map((opt) => {
                const selected = selectedOption?.amountCents === opt.amountCents;
                const styleProps = selected
                  ? ({ color: "emerald" } as const)
                  : ({ outline: true } as const);
                return (
                  <Button
                    key={opt.amountCents}
                    type="button"
                    className="w-full max-w-[180px]"
                    {...styleProps}
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
        <div className="text-xs text-zinc-400">
          Giveaway entries: 1 entry per 500 points earned in each eligible active giveaway. Points carry
          over across donations and drawings are monthly.
        </div>
        <GiveawayProgressCard estimatedPoints={estimatedPoints} />
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
            {submitting ? "Redirecting…" : "Support now"}
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
