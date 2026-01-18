import PublicShell from "@/app/_components/PublicNav";
import { Badge } from "@/ui-kit/badge";
import { Button } from "@/ui-kit/button";
import { Heading } from "@/ui-kit/heading";
import { Text } from "@/ui-kit/text";

export default function QrAccessRequired() {
  return (
    <PublicShell contentClassName="max-w-3xl space-y-6">
      <header className="space-y-3">
        <Badge color="emerald">Donate</Badge>
        <Heading level={1} className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Scan the in-person QR code to donate
        </Heading>
        <Text className="text-zinc-200">
          To keep donations tied to in-store visits, this page only opens from a location QR code.
          Please scan the QR code at the business location to continue.
        </Text>
      </header>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-zinc-200 shadow-lg shadow-black/30">
        Need help? Ask a staff member for the donation QR code.
      </div>
      <div className="flex flex-wrap gap-3">
        <Button href="/" outline>
          Back to home
        </Button>
      </div>
    </PublicShell>
  );
}
