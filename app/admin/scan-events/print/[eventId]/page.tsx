import PrintableScanEventPoster from "./printable-client";

export default async function ScanEventPrintPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return <PrintableScanEventPoster eventId={eventId} />;
}
