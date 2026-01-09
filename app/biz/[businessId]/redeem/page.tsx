import { redirect } from "next/navigation";

export default async function BusinessRedeemRedirect({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  redirect(`/biz/${businessId}/rewards`);
}
