"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatCadence } from "@/lib/server/scan-events";

type ScanEventPayload = {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string | null;
  cadence: { unit: "hours" | "days" | "weeks"; interval: number };
  rewards: {
    points: { enabled: boolean; amount: number };
    giveaway: { enabled: boolean; targetMode: "selected" | "all_active"; giveawayIds: string[]; entries: number };
  };
  association: {
    type: "standalone" | "charity" | "business_location" | "custom";
    causeId?: string | null;
    businessId?: string | null;
    locationId?: string | null;
    customLabel?: string | null;
  };
  proximity?: { mode: "off" | "log" | "enforce"; radiusMeters: number } | null;
};

type ClaimCoords = { lat: number; lng: number; accuracy?: number };

/** How long we wait for a GPS fix before giving up. */
const GEO_TIMEOUT_MS = 15_000;

function formatDistance(meters: number | null): string {
  if (meters === null) return "some distance";
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}

function requestCoords(): Promise<
  { ok: true; coords: ClaimCoords } | { ok: false; reason: "unsupported" | "denied" | "unavailable" }
> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ ok: false, reason: "unsupported" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          ok: true,
          coords: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
          },
        }),
      (error) =>
        resolve({
          ok: false,
          reason: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
        }),
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: 0 },
    );
  });
}

export default function ScanClaimClient({
  token,
  event,
}: {
  token: string;
  event: ScanEventPayload;
}) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [locationState, setLocationState] = useState<
    "idle" | "checking" | "granted" | "too_far" | "denied" | "unavailable"
  >("idle");
  const [locationDistance, setLocationDistance] = useState<number | null>(null);
  const grantRef = useRef<string | null>(null);

  const proximityMode = event.proximity?.mode ?? "off";
  const locationRequired = proximityMode === "enforce";

  const verifyLocation = useCallback(async () => {
    if (!user) return;
    setLocationState("checking");
    setLocationDistance(null);

    const located = await requestCoords();
    if (!located.ok) {
      grantRef.current = null;
      setLocationState(located.reason === "denied" ? "denied" : "unavailable");
      return;
    }

    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/scan-events/verify-location", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token, coords: located.coords }),
      });
      const json = (await res.json()) as {
        withinRadius?: boolean | null;
        grant?: string | null;
        distanceMeters?: number | null;
      };
      if (!res.ok) {
        grantRef.current = null;
        setLocationState("unavailable");
        return;
      }
      grantRef.current = json.grant ?? null;
      setLocationDistance(json.distanceMeters ?? null);
      setLocationState(json.withinRadius === false ? "too_far" : "granted");
    } catch {
      grantRef.current = null;
      setLocationState("unavailable");
    }
  }, [token, user]);

  // Verify as soon as the page opens, so the permission prompt and the check are
  // done by the time the user reaches for the claim button.
  useEffect(() => {
    if (proximityMode === "off" || !user) return;
    void verifyLocation();
  }, [proximityMode, user, verifyLocation]);
  const [result, setResult] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);

  const rewardsLabel = useMemo(() => {
    const parts: string[] = [];
    if (event.rewards.points.enabled && event.rewards.points.amount > 0) {
      parts.push(`${event.rewards.points.amount} points`);
    }
    if (event.rewards.giveaway.enabled && event.rewards.giveaway.entries > 0) {
      parts.push(`${event.rewards.giveaway.entries} giveaway entr${event.rewards.giveaway.entries === 1 ? "y" : "ies"}`);
    }
    return parts.length > 0 ? parts.join(" + ") : "No rewards configured";
  }, [event.rewards.giveaway.enabled, event.rewards.giveaway.entries, event.rewards.points.amount, event.rewards.points.enabled]);

  const associationLabel = useMemo(() => {
    if (event.association.type === "charity") {
      return event.association.causeId ? `Charity (${event.association.causeId})` : "Charity";
    }
    if (event.association.type === "business_location") {
      const business = event.association.businessId ?? "business";
      const location = event.association.locationId ? ` / ${event.association.locationId}` : "";
      return `Business/Location (${business}${location})`;
    }
    if (event.association.type === "custom") {
      return event.association.customLabel
        ? `Custom (${event.association.customLabel})`
        : "Custom";
    }
    return "Standalone Rack Up Event";
  }, [event.association.businessId, event.association.causeId, event.association.customLabel, event.association.locationId, event.association.type]);

  const giveawayLabel = useMemo(() => {
    if (!event.rewards.giveaway.enabled) return "Not enabled";
    if (event.rewards.giveaway.targetMode === "all_active") return "All active giveaways";
    return event.rewards.giveaway.giveawayIds.length > 0
      ? `${event.rewards.giveaway.giveawayIds.length} selected giveaway(s)`
      : "Selected giveaways";
  }, [event.rewards.giveaway.enabled, event.rewards.giveaway.giveawayIds.length, event.rewards.giveaway.targetMode]);

  function fireSuccessConfetti() {
    if (typeof window === "undefined") return;
    const colors = ["#34d399", "#10b981", "#6ee7b7", "#a7f3d0"];
    const shoot = (originX: number) =>
      confetti({
        particleCount: 80,
        spread: 70,
        startVelocity: 34,
        gravity: 0.9,
        decay: 0.92,
        origin: { x: originX, y: 0.2 },
        colors,
      });
    shoot(0.2);
    shoot(0.8);
    window.setTimeout(() => shoot(0.5), 260);
  }

  async function claim() {
    if (!user || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/scan-events/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ token, locationGrant: grantRef.current }),
      });
      const json = (await res.json()) as {
        error?: string;
        blockedByDistance?: boolean;
        reason?: string;
        distanceMeters?: number | null;
        radiusMeters?: number | null;
        blockedByCadence?: boolean;
        nextEligibleAt?: string | null;
        pointsAwarded?: number;
        giveawayEntriesAwarded?: number;
        giveawayAwardCount?: number;
      };
      if (!res.ok) {
        if (json.blockedByDistance) {
          // The grant expired or was never issued; re-verify so the user can retry.
          grantRef.current = null;
          void verifyLocation();
          setResult({
            tone: "warn",
            text:
              json.reason === "expired"
                ? "Your location check expired. We're re-checking now — try again in a moment."
                : "We couldn't confirm you're at the location. This reward can only be claimed on site.",
          });
          return;
        }
        if (json.blockedByCadence) {
          const when = json.nextEligibleAt
            ? event.cadence.unit === "days"
              ? new Date(json.nextEligibleAt).toLocaleDateString("en-US", { timeZone: "America/New_York" })
              : new Date(json.nextEligibleAt).toLocaleString()
            : "later";
          setResult({ tone: "warn", text: `Already claimed in this window. Next eligible: ${when}.` });
        } else {
          throw new Error(json.error ?? "Claim failed.");
        }
        return;
      }
      const rewards: string[] = [];
      if ((json.pointsAwarded ?? 0) > 0) rewards.push(`${json.pointsAwarded} points`);
      if ((json.giveawayEntriesAwarded ?? 0) > 0) {
        const giveawayCount = json.giveawayAwardCount ?? 1;
        const label =
          giveawayCount > 1
            ? `${json.giveawayEntriesAwarded} giveaway entries across ${giveawayCount} giveaways`
            : `${json.giveawayEntriesAwarded} giveaway entr${json.giveawayEntriesAwarded === 1 ? "y" : "ies"}`;
        rewards.push(label);
      }
      setResult({
        tone: "ok",
        text: rewards.length > 0 ? `Claim successful: ${rewards.join(" + ")}.` : "Claim successful.",
      });
      fireSuccessConfetti();
    } catch (err) {
      setResult({ tone: "error", text: err instanceof Error ? err.message : "Claim failed." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-5 rounded-2xl border border-white/10 bg-zinc-900/75 p-6 text-white shadow-xl shadow-black/30">
      {event.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.imageUrl} alt={event.title} className="h-auto w-full rounded-xl object-contain" />
      ) : null}
      <div>
        <p className="text-xs uppercase tracking-wider text-zinc-400">Rack Up Scan Event</p>
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        {event.description ? <p className="mt-1 text-sm text-zinc-300">{event.description}</p> : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-200">
        <p>Cadence: {formatCadence(event.cadence)}</p>
        <p className="mt-1">Rewards: {rewardsLabel}</p>
        {proximityMode === "enforce" ? (
          <p className="mt-1 text-zinc-400">
            Must be claimed at the location &mdash; your device location is checked.
          </p>
        ) : null}
        <p className="mt-1">Association: {associationLabel}</p>
        <p className="mt-1">Giveaway target: {giveawayLabel}</p>
        {event.rewards.giveaway.enabled &&
        event.rewards.giveaway.targetMode === "selected" &&
        event.rewards.giveaway.giveawayIds.length > 0 ? (
          <p className="mt-1 break-all text-xs text-zinc-400">
            IDs: {event.rewards.giveaway.giveawayIds.join(", ")}
          </p>
        ) : null}
      </div>

      {user && proximityMode !== "off" ? (
        <div
          className={`rounded-lg border p-3 text-sm ${
            locationState === "granted"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
              : locationState === "checking" || locationState === "idle"
                ? "border-white/10 bg-white/5 text-zinc-300"
                : locationState === "too_far"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                  : "border-red-500/40 bg-red-500/10 text-red-100"
          }`}
        >
          {locationState === "checking" || locationState === "idle" ? (
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent"
              />
              Verifying you&rsquo;re at the location...
            </span>
          ) : locationState === "granted" ? (
            <>Location confirmed &mdash; you&rsquo;re good to claim.</>
          ) : (
            <div className="space-y-2">
              <p>
                {locationState === "too_far"
                  ? `You're about ${formatDistance(locationDistance)} away. This reward can only be claimed at the location.`
                  : locationState === "denied"
                    ? "Location access is blocked. Enable location for this site in your browser settings, then try again."
                    : "We couldn't determine your location. Check that location services are on, then try again."}
              </p>
              <button
                type="button"
                onClick={() => void verifyLocation()}
                className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      ) : null}

      {!user ? (
        <Link
          href={`/signin?redirect=${encodeURIComponent(`/s/${token}`)}`}
          className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black"
        >
          Sign in to claim
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => void claim()}
          disabled={submitting || (locationRequired && locationState !== "granted")}
          className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
        >
          {submitting ? "Claiming..." : "Claim scan reward"}
        </button>
      )}

      {result ? (
        <div
          className={`rounded-lg border p-3 text-sm ${
            result.tone === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
              : result.tone === "warn"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                : "border-red-500/40 bg-red-500/10 text-red-100"
          }`}
        >
          {result.text}
        </div>
      ) : null}
    </main>
  );
}
