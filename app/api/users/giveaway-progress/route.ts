import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/lib/server/auth";
import {
  getDefaultEntryUnitPoints,
  normalizeGiveawayEntryConfig,
} from "@/lib/server/giveaway-entry-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProgressRow = {
  giveawayId: string;
  entryUnitPoints: number;
  carryPoints: number;
  pointsToNextEntry: number;
};

function normalizeCarry(value: unknown, entryUnitPoints: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const normalized = Math.floor(Math.max(0, value));
  return normalized % entryUnitPoints;
}

export async function GET(request: Request) {
  try {
    const { uid } = await requireUser(request);
    const activeGiveawaysSnap = await adminFirestore
      .collection("giveaways")
      .where("status", "==", "active")
      .limit(100)
      .get();

    const activeGiveawayIds = activeGiveawaysSnap.docs.map((doc) => doc.id);
    if (activeGiveawayIds.length === 0) {
      return NextResponse.json({
        activeGiveawayCount: 0,
        entryUnitPoints: getDefaultEntryUnitPoints(),
        pointsToNextEntry: getDefaultEntryUnitPoints(),
        carryPoints: 0,
        perGiveaway: [] as ProgressRow[],
      });
    }

    const refs = activeGiveawayIds.map((giveawayId) =>
      adminFirestore.collection("giveaway_point_balances").doc(`${giveawayId}_${uid}`),
    );
    const balanceSnaps = await adminFirestore.getAll(...refs);

    const perGiveaway: ProgressRow[] = activeGiveawayIds.map((giveawayId, index) => {
      const giveawayData = activeGiveawaysSnap.docs[index]?.data() as { entryConfig?: unknown } | undefined;
      const entryConfig = normalizeGiveawayEntryConfig(giveawayData?.entryConfig);
      const snap = balanceSnaps[index];
      const data = snap?.data() as { remainingPoints?: number } | undefined;
      const carryPoints = normalizeCarry(data?.remainingPoints, entryConfig.entryUnitPoints);
      const pointsToNextEntry =
        carryPoints === 0 ? entryConfig.entryUnitPoints : entryConfig.entryUnitPoints - carryPoints;
      return {
        giveawayId,
        entryUnitPoints: entryConfig.entryUnitPoints,
        carryPoints,
        pointsToNextEntry,
      };
    });

    perGiveaway.sort((a, b) => a.pointsToNextEntry - b.pointsToNextEntry);
    const nearest = perGiveaway[0];

    return NextResponse.json({
      activeGiveawayCount: activeGiveawayIds.length,
      entryUnitPoints: nearest?.entryUnitPoints ?? getDefaultEntryUnitPoints(),
      pointsToNextEntry: nearest?.pointsToNextEntry ?? getDefaultEntryUnitPoints(),
      carryPoints: nearest?.carryPoints ?? 0,
      nearestGiveawayId: nearest?.giveawayId ?? null,
      perGiveaway,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to load giveaway progress." }, { status: 500 });
  }
}
