import { adminAuth } from "@/lib/firebase/admin";

const DEFAULT_BASE = "http://127.0.0.1:3000";

// Prefers the configured site URL, then the platform-set forwarded host, and
// only then the client-controlled Origin header — reset/invite links are built
// from this value, so client-supplied headers must not take precedence.
export function resolveOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (forwardedHost ? `${forwardedProto}://${forwardedHost}` : null) ??
    request.headers.get("origin") ??
    "";
  return (origin || DEFAULT_BASE).replace(/\/$/, "");
}

// Generates a Firebase password-reset link and rewrites it to land on one of
// our pages (which consume the oobCode client-side) instead of the default
// Firebase-hosted action handler.
export async function generatePasswordResetPageLink(
  email: string,
  origin: string,
  path: "/invite" | "/reset-password",
): Promise<string> {
  const actionLink = await adminAuth.generatePasswordResetLink(email, {
    url: `${origin}${path}`,
    handleCodeInApp: true,
  });
  try {
    const parsed = new URL(actionLink);
    const code = parsed.searchParams.get("oobCode");
    if (!code) return actionLink;
    return `${origin}${path}?oobCode=${encodeURIComponent(code)}`;
  } catch {
    return actionLink;
  }
}
