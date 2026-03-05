import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GIVEAWAY_ENTRY_POINTS = 500;

type ProgressRow = {
  giveawayId: string;
  carryPoints: number;
  pointsToNextEntry: number;
};

function normalizeCarry(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const normalized = Math.floor(Math.max(0, value));
  return normalized % GIVEAWAY_ENTRY_POINTS;
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
        entryUnitPoints: GIVEAWAY_ENTRY_POINTS,
        pointsToNextEntry: GIVEAWAY_ENTRY_POINTS,
        carryPoints: 0,
        perGiveaway: [] as ProgressRow[],
      });
    }

    const refs = activeGiveawayIds.map((giveawayId) =>
      adminFirestore.collection("giveaway_point_balances").doc(`${giveawayId}_${uid}`),
    );
    const balanceSnaps = await adminFirestore.getAll(...refs);

    const perGiveaway: ProgressRow[] = activeGiveawayIds.map((giveawayId, index) => {
      const snap = balanceSnaps[index];
      const data = snap?.data() as { remainingPoints?: number } | undefined;
      const carryPoints = normalizeCarry(data?.remainingPoints);
      const pointsToNextEntry =
        carryPoints === 0 ? GIVEAWAY_ENTRY_POINTS : GIVEAWAY_ENTRY_POINTS - carryPoints;
      return {
        giveawayId,
        carryPoints,
        pointsToNextEntry,
      };
    });

    perGiveaway.sort((a, b) => a.pointsToNextEntry - b.pointsToNextEntry);
    const nearest = perGiveaway[0];

    return NextResponse.json({
      activeGiveawayCount: activeGiveawayIds.length,
      entryUnitPoints: GIVEAWAY_ENTRY_POINTS,
      pointsToNextEntry: nearest?.pointsToNextEntry ?? GIVEAWAY_ENTRY_POINTS,
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
