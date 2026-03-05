import { redirect } from "next/navigation";

export default async function DonationRemoteCausePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; causeSlug: string }>;
  searchParams?: { qr?: string | string[] };
}) {
  const { causeSlug } = await params;
  const query = searchParams ?? {};
  const qrValue = query?.qr;
  const qrTokenValue = Array.isArray(qrValue) ? qrValue[0] : qrValue ?? null;
  const target = qrTokenValue
    ? `/donate/remote/${causeSlug}?qr=${encodeURIComponent(qrTokenValue)}`
    : `/donate/remote/${causeSlug}`;
  redirect(target);
}
