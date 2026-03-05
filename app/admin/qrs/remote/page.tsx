import { createRemoteBusinessQrToken } from "@/lib/server/qr-access";
import PrintableRemoteLandingQr from "./printable-client";

export default async function AdminRemoteLandingQrPage() {
  return <PrintableRemoteLandingQr config={{ qrToken: createRemoteBusinessQrToken({}) }} />;
}
