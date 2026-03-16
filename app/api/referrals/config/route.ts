import { NextResponse } from "next/server";
import { getReferralConfig } from "@/lib/server/referrals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getReferralConfig();
  return NextResponse.json({
    enabled: config.enabled,
    inviterPoints: config.inviterPoints,
    invitedPoints: config.invitedPoints,
  });
}
