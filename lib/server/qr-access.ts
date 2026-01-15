import crypto from "crypto";

const SECRET_ENV = "DONATION_QR_SECRET";

type QrPayload = {
  v: 1;
  t: "location" | "cause";
  b: string;
  l: string;
  c?: string;
};

function requireSecret(): Buffer {
  const secret = process.env[SECRET_ENV];
  if (!secret) {
    throw new Error(`Missing required env var: ${SECRET_ENV}`);
  }
  return Buffer.from(secret, "utf8");
}

function base64UrlEncode(value: Buffer | string): string {
  const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = padded.length % 4 === 0 ? 0 : 4 - (padded.length % 4);
  const withPadding = padded + "=".repeat(padLength);
  return Buffer.from(withPadding, "base64");
}

function signPayload(encodedPayload: string): string {
  const secret = requireSecret();
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(encodedPayload);
  return base64UrlEncode(hmac.digest());
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function encodePayload(payload: QrPayload): string {
  return base64UrlEncode(JSON.stringify(payload));
}

function decodePayload(encodedPayload: string): QrPayload | null {
  try {
    const json = base64UrlDecode(encodedPayload).toString("utf8");
    return JSON.parse(json) as QrPayload;
  } catch {
    return null;
  }
}

function verifyToken(
  token: string,
  expected: { type: QrPayload["t"]; businessSlug: string; locationSlug: string; causeSlug?: string },
): boolean {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;
  const expectedSignature = signPayload(encodedPayload);
  if (!timingSafeEqual(signature, expectedSignature)) return false;

  const payload = decodePayload(encodedPayload);
  if (!payload || payload.v !== 1) return false;
  if (payload.t !== expected.type) return false;
  if (payload.b !== expected.businessSlug) return false;
  if (payload.l !== expected.locationSlug) return false;
  if (expected.causeSlug && payload.c !== expected.causeSlug) return false;
  return true;
}

export function createLocationQrToken(params: { businessSlug: string; locationSlug: string }): string {
  const payload: QrPayload = {
    v: 1,
    t: "location",
    b: params.businessSlug,
    l: params.locationSlug,
  };
  const encoded = encodePayload(payload);
  const signature = signPayload(encoded);
  return `${encoded}.${signature}`;
}

export function createCauseQrToken(params: {
  businessSlug: string;
  locationSlug: string;
  causeSlug: string;
}): string {
  const payload: QrPayload = {
    v: 1,
    t: "cause",
    b: params.businessSlug,
    l: params.locationSlug,
    c: params.causeSlug,
  };
  const encoded = encodePayload(payload);
  const signature = signPayload(encoded);
  return `${encoded}.${signature}`;
}

export function validateLocationQrToken(
  token: string | null,
  params: { businessSlug: string; locationSlug: string },
): boolean {
  if (!token) return false;
  return verifyToken(token, {
    type: "location",
    businessSlug: params.businessSlug,
    locationSlug: params.locationSlug,
  });
}

export function validateCauseQrToken(
  token: string | null,
  params: { businessSlug: string; locationSlug: string; causeSlug: string },
): boolean {
  if (!token) return false;
  return verifyToken(token, {
    type: "cause",
    businessSlug: params.businessSlug,
    locationSlug: params.locationSlug,
    causeSlug: params.causeSlug,
  });
}
