import { redirect } from "next/navigation";

export default async function BusinessCausesRedirect({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  redirect(`/biz/${businessId}/charities`);
}
