import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase/admin";
import { getOptionalUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  kind?: "window_error" | "unhandled_rejection" | "react_error_boundary" | "manual";
  message?: string;
  name?: string;
  stack?: string | null;
  componentStack?: string | null;
  path?: string | null;
  href?: string | null;
  userAgent?: string | null;
  extra?: Record<string, unknown> | null;
  at?: string | null;
};

function trimString(value: unknown, max = 5000) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function POST(request: Request) {
  try {
    const auth = await getOptionalUser(request);
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const message = trimString(body.message, 2000);
    if (!message) {
      return NextResponse.json({ error: "message is required." }, { status: 400 });
    }

    const payload = {
      kind:
        body.kind === "window_error" ||
        body.kind === "unhandled_rejection" ||
        body.kind === "react_error_boundary"
          ? body.kind
          : "manual",
      message,
      name: trimString(body.name, 200) ?? null,
      stack: trimString(body.stack, 12000),
      componentStack: trimString(body.componentStack, 12000),
      path: trimString(body.path, 400),
      href: trimString(body.href, 1500),
      userAgent: trimString(body.userAgent, 1500),
      extra:
        body.extra && typeof body.extra === "object"
          ? JSON.parse(JSON.stringify(body.extra))
          : null,
      clientAt: trimString(body.at, 120),
      uid: auth?.uid ?? null,
      email: auth?.email ?? null,
      createdAt: Timestamp.now(),
      createdServerAt: FieldValue.serverTimestamp(),
    };

    await adminFirestore.collection("client_error_logs").add(payload);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to log client error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
