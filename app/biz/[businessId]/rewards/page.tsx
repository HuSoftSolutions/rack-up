import { redirect } from "next/navigation";

export default async function BusinessRewardsRedirect({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  redirect(`/biz/${businessId}/redeem`);
}
