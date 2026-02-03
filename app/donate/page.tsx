import PublicShell from "@/app/_components/PublicNav";
import FeaturedPartners from "@/app/_components/FeaturedPartners";
import { Badge } from "@/ui-kit/badge";
import { Heading } from "@/ui-kit/heading";
import { Text } from "@/ui-kit/text";

export default async function DonateIndexPage() {
  return (
    <PublicShell contentClassName="max-w-5xl space-y-8">
      <header className="space-y-3">
        <Badge color="emerald">Donate</Badge>
        <Heading level={1} className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Donate in person
        </Heading>
        <Text className="text-zinc-200">
          Donations are started by scanning the QR code at a participating location.
        </Text>
      </header>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-200 shadow-lg shadow-black/30">
        <div className="space-y-2">
          <div className="text-base font-semibold text-white">How it works</div>
          <div>1. Visit a Rack Up partner location.</div>
          <div>2. Scan the posted QR code with your phone.</div>
          <div>3. Choose a cause and complete your donation securely.</div>
        </div>
      </div>

      <FeaturedPartners partners={[]} />
    </PublicShell>
  );
}
