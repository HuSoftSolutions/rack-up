import { NextResponse } from "next/server";
import { DocumentData, Query, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReportMeta = {
  startDate: string;
  endDate: string;
  limit: number;
  filters: Record<string, unknown>;
};

function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseDate(value: string | null, endOfDay = false): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  } else {
    parsed.setHours(0, 0, 0, 0);
  }
  return parsed;
}

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

function clampLimit(value: string | null, fallback = 1000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(100, parsed), 5000);
}

async function safe<T>(label: string, fn: () => Promise<T>, warnings: string[], fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`${label}: ${message}`);
    return fallback;
  }
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get("limit"), 25);

    const snap = await adminFirestore
      .collection("reports")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const reports = snap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        createdAt: toIso(data.createdAt),
        createdBy: data.createdBy ?? null,
        createdByEmail: data.createdByEmail ?? null,
        name: data.name ?? null,
        tags: data.tags ?? null,
        meta: data.meta ?? null,
        summary: data.summary ?? null,
        warnings: data.warnings ?? null,
      };
    });

    return NextResponse.json({ reports });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Failed to load reports.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAdmin(request);
    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get("limit"), 1000);
    let body: { name?: string; tags?: string[] } | null = null;
    try {
      body = (await request.json()) as { name?: string; tags?: string[] };
    } catch {
      body = null;
    }
    const name = body?.name?.trim() || null;
    const tags = Array.isArray(body?.tags)
      ? body?.tags.map((tag) => tag.trim()).filter(Boolean)
      : [];

    const startParam = url.searchParams.get("start");
    const endParam = url.searchParams.get("end");
    const startDate = parseDate(startParam) ?? new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
    const endDate = parseDate(endParam, true) ?? new Date();

    const businessId = url.searchParams.get("businessId") || null;
    const locationIds = parseList(url.searchParams.get("locationIds"));
    const causeIds = parseList(url.searchParams.get("causeIds"));
    const dealIds = parseList(url.searchParams.get("dealIds"));
    const userId = url.searchParams.get("userId") || null;
    const email = url.searchParams.get("email") || null;
    const donationStatus = parseList(url.searchParams.get("donationStatus"));
    const transactionStatus = parseList(url.searchParams.get("transactionStatus"));
    const transactionTypes = parseList(url.searchParams.get("transactionTypes"));
    const rewardStatus = parseList(url.searchParams.get("rewardStatus"));

    const warnings: string[] = [];

    const startTs = Timestamp.fromDate(startDate);
    const endTs = Timestamp.fromDate(endDate);

    const donations = await safe(
      "donations",
      async () => {
        let query = adminFirestore
          .collection("donations")
          .where("createdAt", ">=", startTs)
          .where("createdAt", "<=", endTs);
        if (businessId) query = query.where("businessId", "==", businessId);
        const snap = await query.orderBy("createdAt", "desc").limit(limit).get();
        const rows = snap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            createdAt: toIso(data.createdAt),
            status: data.status ?? null,
            amountCents: data.amountCents ?? null,
            points: data.points ?? null,
            businessId: data.businessId ?? null,
            businessName: data.businessName ?? null,
            locationId: data.locationId ?? null,
            locationSlug: data.locationSlug ?? null,
            causeId: data.causeId ?? null,
            causeTitle: data.causeTitle ?? null,
            charityId: data.charityId ?? null,
            userId: data.userId ?? null,
            donorName: data.donorName ?? null,
            donorEmail: data.donorEmail ?? null,
            donorPhone: data.donorPhone ?? null,
            stripe: data.stripe ?? null,
          };
        });
        const filtered = rows.filter((row) => {
          if (locationIds.length > 0 && !locationIds.includes(row.locationId ?? "")) return false;
          if (causeIds.length > 0 && !causeIds.includes(row.causeId ?? "")) return false;
          if (userId && row.userId !== userId) return false;
          if (donationStatus.length > 0 && !donationStatus.includes(row.status ?? "")) return false;
          return true;
        });
        return { rows: filtered, truncated: rows.length >= limit };
      },
      warnings,
      { rows: [], truncated: false },
    );

    const transactions = await safe(
      "transactions",
      async () => {
        let query = adminFirestore
          .collection("transactions")
          .where("createdAt", ">=", startTs)
          .where("createdAt", "<=", endTs);
        if (businessId) query = query.where("businessId", "==", businessId);
        const snap = await query.orderBy("createdAt", "desc").limit(limit).get();
        const rows = snap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            createdAt: toIso(data.createdAt),
            status: data.status ?? null,
            type: data.type ?? null,
            pointsDelta: data.pointsDelta ?? null,
            amountCents: data.amountCents ?? null,
            businessId: data.businessId ?? null,
            locationId: data.locationId ?? null,
            userId: data.userId ?? null,
            dealId: data.dealId ?? null,
            causeId: data.causeId ?? null,
            stripePaymentIntentId: data.stripePaymentIntentId ?? null,
          };
        });
        const filtered = rows.filter((row) => {
          if (locationIds.length > 0 && !locationIds.includes(row.locationId ?? "")) return false;
          if (causeIds.length > 0 && !causeIds.includes(row.causeId ?? "")) return false;
          if (userId && row.userId !== userId) return false;
          if (transactionStatus.length > 0 && !transactionStatus.includes(row.status ?? "")) return false;
          if (transactionTypes.length > 0 && !transactionTypes.includes(row.type ?? "")) return false;
          return true;
        });
        return { rows: filtered, truncated: rows.length >= limit };
      },
      warnings,
      { rows: [], truncated: false },
    );

    const rewards = await safe(
      "rewards",
      async () => {
        let query = adminFirestore
          .collection("reward_issues")
          .where("issuedAt", ">=", startTs)
          .where("issuedAt", "<=", endTs);
        if (businessId) query = query.where("businessId", "==", businessId);
        const snap = await query.orderBy("issuedAt", "desc").limit(limit).get();
        const rows = snap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            issuedAt: toIso(data.issuedAt),
            usedAt: toIso(data.usedAt),
            status: data.status ?? null,
            code: data.code ?? null,
            businessId: data.businessId ?? null,
            dealId: data.dealId ?? null,
            userId: data.userId ?? null,
            redeemLocationId: data.redeemLocationId ?? null,
            redeemLocationName: data.redeemLocationName ?? null,
          };
        });
        const filtered = rows.filter((row) => {
          if (locationIds.length > 0 && !locationIds.includes(row.redeemLocationId ?? "")) return false;
          if (userId && row.userId !== userId) return false;
          if (dealIds.length > 0 && !dealIds.includes(row.dealId ?? "")) return false;
          if (rewardStatus.length > 0 && !rewardStatus.includes(row.status ?? "")) return false;
          return true;
        });
        return { rows: filtered, truncated: rows.length >= limit };
      },
      warnings,
      { rows: [], truncated: false },
    );

    const causes = await safe(
      "causes",
      async () => {
        const snap = await adminFirestore
          .collection("causes")
          .where("createdAt", ">=", startTs)
          .where("createdAt", "<=", endTs)
          .orderBy("createdAt", "desc")
          .limit(limit)
          .get();
        const rows = snap.docs.map((doc) => {
          const data = doc.data() as { title?: string; active?: boolean; createdAt?: unknown };
          return {
            id: doc.id,
            title: data.title ?? doc.id,
            active: data.active ?? true,
            createdAt: toIso(data.createdAt),
          };
        });
        const filtered = rows.filter((row) => (causeIds.length > 0 ? causeIds.includes(row.id) : true));
        return { rows: filtered, truncated: rows.length >= limit };
      },
      warnings,
      { rows: [], truncated: false },
    );

    const deals = await safe(
      "deals",
      async () => {
        let query: Query<DocumentData> = adminFirestore.collection("deals");
        if (businessId) query = query.where("businessId", "==", businessId);
        const snap = await query.limit(limit).get();
        const rows = snap.docs.map((doc) => {
          const data = doc.data() as { title?: string; active?: boolean; businessId?: string; createdAt?: unknown; pointCost?: number };
          return {
            id: doc.id,
            title: data.title ?? doc.id,
            active: data.active ?? true,
            businessId: data.businessId ?? null,
            pointCost: data.pointCost ?? null,
            createdAt: toIso(data.createdAt),
          };
        });
        const filtered = rows.filter((row) => {
          if (dealIds.length > 0 && !dealIds.includes(row.id)) return false;
          return true;
        });
        return { rows: filtered, truncated: rows.length >= limit };
      },
      warnings,
      { rows: [], truncated: false },
    );

    const businesses = await safe(
      "businesses",
      async () => {
        const snap = await adminFirestore.collection("businesses").get();
        const rows = snap.docs.map((doc) => {
          const data = doc.data() as { name?: string; active?: boolean; createdAt?: unknown };
          return {
            id: doc.id,
            name: data.name ?? doc.id,
            active: data.active ?? true,
            createdAt: toIso(data.createdAt),
          };
        });
        const filtered = rows.filter((row) => (businessId ? row.id === businessId : true));
        return { rows: filtered, truncated: rows.length >= limit };
      },
      warnings,
      { rows: [], truncated: false },
    );

    const locations = await safe(
      "locations",
      async () => {
        const bizSnap = await adminFirestore.collection("businesses").get();
        const rows: Array<{ businessId: string; locationId: string; name: string; active: boolean }> = [];
        for (const biz of bizSnap.docs) {
          if (businessId && biz.id !== businessId) continue;
          const locationsSnap = await biz.ref.collection("locations").get();
          locationsSnap.docs.forEach((loc) => {
            const data = loc.data() as { name?: string; active?: boolean };
            rows.push({
              businessId: biz.id,
              locationId: loc.id,
              name: data.name ?? loc.id,
              active: data.active ?? true,
            });
          });
        }
        const filtered = rows.filter((row) => (locationIds.length > 0 ? locationIds.includes(row.locationId) : true));
        return { rows: filtered.slice(0, limit), truncated: rows.length >= limit };
      },
      warnings,
      { rows: [], truncated: false },
    );

    const users = await safe(
      "users",
      async () => {
        const adminsSnap = await adminFirestore.collection("admins").get();
        const adminIds = new Set(adminsSnap.docs.map((doc) => doc.id));
        const bizAdminsSnap = await adminFirestore.collection("business_admins").get();
        const bizMap = new Map(
          bizAdminsSnap.docs.map((doc) => {
            const data = doc.data() as { businessId?: string; role?: string; locationIds?: string[] };
            return [
              doc.id,
              {
                businessId: data.businessId ?? null,
                role: data.role ?? null,
                locationIds: Array.isArray(data.locationIds) ? data.locationIds : [],
              },
            ];
          }),
        );

        const collected: Array<{
          uid: string;
          email: string | null;
          displayName: string | null;
          createdAt: string | null;
          isAdmin: boolean;
          businessAdmin: { businessId: string | null; role: string | null; locationIds: string[] } | null;
        }> = [];

        let pageToken: string | undefined;
        while (collected.length < limit) {
          const result = await adminAuth.listUsers(1000, pageToken);
          for (const user of result.users) {
            const adminFlag = adminIds.has(user.uid);
            const biz = bizMap.get(user.uid) ?? null;
            const row = {
              uid: user.uid,
              email: user.email ?? null,
              displayName: user.displayName ?? null,
              createdAt: user.metadata.creationTime ?? null,
              isAdmin: adminFlag,
              businessAdmin: biz
                ? { businessId: biz.businessId, role: biz.role, locationIds: biz.locationIds }
                : null,
            };
            collected.push(row);
            if (collected.length >= limit) break;
          }
          pageToken = result.pageToken;
          if (!pageToken) break;
        }

        let filtered = collected;
        if (userId) filtered = filtered.filter((row) => row.uid === userId);
        if (email) filtered = filtered.filter((row) => row.email?.toLowerCase() === email.toLowerCase());
        if (businessId) {
          filtered = filtered.filter((row) => row.businessAdmin?.businessId === businessId);
        }
        if (locationIds.length > 0) {
          filtered = filtered.filter((row) =>
            row.businessAdmin?.locationIds?.some((loc) => locationIds.includes(loc)),
          );
        }

        return { rows: filtered, truncated: collected.length >= limit };
      },
      warnings,
      { rows: [], truncated: false },
    );

    const summary = {
      donations: {
        count: donations.rows.length,
        totalCents: donations.rows.reduce((sum, row) => sum + (row.amountCents ?? 0), 0),
      },
      transactions: {
        count: transactions.rows.length,
        pointsDelta: transactions.rows.reduce((sum, row) => sum + (row.pointsDelta ?? 0), 0),
      },
      rewards: {
        issued: rewards.rows.filter((row) => row.status === "issued").length,
        used: rewards.rows.filter((row) => row.status === "used").length,
      },
      users: {
        count: users.rows.length,
        admins: users.rows.filter((row) => row.isAdmin).length,
        business: users.rows.filter((row) => row.businessAdmin).length,
      },
    };

    const meta: ReportMeta = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      limit,
      filters: {
        businessId,
        locationIds,
        causeIds,
        dealIds,
        userId,
        email,
        donationStatus,
        transactionStatus,
        transactionTypes,
        rewardStatus,
      },
    };

    const reportPayload = {
      meta,
      summary,
      datasets: {
        donations,
        transactions,
        rewards,
        causes,
        deals,
        businesses,
        locations,
        users,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    };

    const reportRef = await adminFirestore.collection("reports").add({
      createdAt: Timestamp.now(),
      createdBy: ctx.uid,
      createdByEmail: ctx.email ?? null,
      name,
      tags,
      ...reportPayload,
    });

    return NextResponse.json({
      id: reportRef.id,
      ...reportPayload,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Failed to generate report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
