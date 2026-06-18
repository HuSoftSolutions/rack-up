// Lightweight, single-load wrapper around the Google Maps JavaScript API.
// Uses the official inline bootstrap loader so libraries can be imported on demand
// via `google.maps.importLibrary(...)`. Gated behind NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.

let bootstrapped = false;

export function getGoogleMapsApiKey(): string | undefined {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || undefined;
}

/**
 * Ensures the Google Maps bootstrap loader is installed. Safe to call repeatedly —
 * the loader itself guarantees the script is only fetched once.
 * Returns false (and does nothing) when no API key is configured.
 */
export function ensureGoogleMapsLoader(): boolean {
  if (typeof window === "undefined") return false;
  const key = getGoogleMapsApiKey();
  if (!key) return false;
  if (bootstrapped || typeof window.google?.maps?.importLibrary === "function") {
    bootstrapped = true;
    return true;
  }

  // Official dynamic library loader bootstrap (https://goo.gle/js-api-loading).
  ((g: Record<string, unknown>) => {
    let h: Promise<unknown>;
    const c = "google";
    const w = window as unknown as Record<string, Record<string, unknown>>;
    const b = (w[c] = w[c] || {});
    const d = (b.maps = (b.maps as Record<string, unknown>) || {});
    const r = new Set<string>();
    const e = new URLSearchParams();
    const u = () =>
      h ||
      (h = new Promise<void>(async (res, rej) => {
        const a = document.createElement("script");
        e.set("libraries", [...r].join(","));
        for (const k in g) e.set(k.replace(/[A-Z]/g, (t) => "_" + t[0].toLowerCase()), String(g[k]));
        e.set("callback", c + ".maps.__ib__");
        a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
        (d as Record<string, unknown>).__ib__ = res;
        a.onerror = () => rej(new Error("The Google Maps JavaScript API could not load."));
        a.nonce = (document.querySelector("script[nonce]") as HTMLScriptElement | null)?.nonce || "";
        document.head.append(a);
      }));
    (d as Record<string, unknown>).importLibrary = (f: string, ...n: unknown[]) =>
      r.add(f) &&
      u().then(() => (d as { importLibrary: (f: string, ...n: unknown[]) => unknown }).importLibrary(f, ...n));
  })({ key });

  bootstrapped = true;
  return true;
}

/** Imports a Maps library (e.g. "places", "maps", "marker"). Throws if no key. */
export async function importMapsLibrary<T = unknown>(name: string): Promise<T> {
  if (!ensureGoogleMapsLoader()) {
    throw new Error("Google Maps is not configured (missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).");
  }
  return (await google.maps.importLibrary(name)) as T;
}
