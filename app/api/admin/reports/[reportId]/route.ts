import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === "object" && value !== null && "_seconds" in value) {
    const ts = value as { _seconds: number; _nanoseconds?: number };
    return new Date(ts._seconds * 1000 + Math.floor((ts._nanoseconds ?? 0) / 1_000_000)).toISOString();
  }
  return null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  try {
    await requireAdmin(request);
    const { reportId } = await context.params;
    if (!reportId) return NextResponse.json({ error: "reportId is required." }, { status: 400 });

    const snap = await adminFirestore.collection("reports").doc(reportId).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }
    const data = snap.data() as Record<string, unknown>;

    return NextResponse.json({
      id: snap.id,
      createdAt: toIso(data.createdAt),
      createdBy: data.createdBy ?? null,
      createdByEmail: data.createdByEmail ?? null,
      name: data.name ?? null,
      tags: data.tags ?? null,
      meta: data.meta ?? null,
      summary: data.summary ?? null,
      datasets: data.datasets ?? null,
      warnings: data.warnings ?? null,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Failed to load report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  try {
    await requireAdmin(request);
    const { reportId } = await context.params;
    if (!reportId) return NextResponse.json({ error: "reportId is required." }, { status: 400 });

    await adminFirestore.collection("reports").doc(reportId).delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Failed to delete report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
