import { notFound } from "next/navigation";
import { adminFirestore } from "@/lib/firebase/admin";
import { createRemoteCauseQrToken } from "@/lib/server/qr-access";
import PrintableRemoteCauseQr from "./printable-client";

type Props = {
  params: Promise<{ causeSlug: string }>;
};

export default async function AdminRemoteCauseQrPage({ params }: Props) {
  const { causeSlug } = await params;
  const causeSnap = await adminFirestore.collection("causes").doc(causeSlug).get();
  if (!causeSnap.exists) return notFound();
  const cause = causeSnap.data() as { title?: string };

  return (
    <PrintableRemoteCauseQr
      config={{
        causeTitle: cause.title ?? causeSlug,
        causeSlug,
        qrToken: createRemoteCauseQrToken({ causeSlug }),
      }}
    />
  );
}
