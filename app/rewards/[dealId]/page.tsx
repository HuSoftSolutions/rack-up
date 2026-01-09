import { headers } from "next/headers";
import { notFound } from "next/navigation";
import DealRedeemCard from "./redeem-client";

export const dynamic = "force-dynamic";

async function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const headerList = await headers();
  const forwardedHost = headerList.get("x-forwarded-host");
  const host = forwardedHost ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return "http://localhost:3000";
}

async function getDeal(dealId: string) {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/rewards/deals/${dealId}`, {
    cache: "no-store",
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { deal?: unknown };
  return json.deal as {
    id: string;
    businessId: string | null;
    businessName: string | null;
    title: string | null;
    description: string | null;
    terms: string | null;
    pointCost: number | null;
    type: string | null;
    locations: string[];
  };
}

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;
  const deal = await getDeal(dealId);
  if (!deal) notFound();

  return <DealRedeemCard deal={deal} />;
}
