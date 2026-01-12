import type { Metadata } from "next";
import PublicShell from "@/app/_components/PublicNav";
import { Badge } from "@/ui-kit/badge";
import { Button } from "@/ui-kit/button";
import { Heading } from "@/ui-kit/heading";
import { Text } from "@/ui-kit/text";
import { stripe } from "@/lib/stripe/server";

type ShareData = {
  amountLabel: string;
  causeTitle?: string;
  businessName?: string;
};

async function fetchShareData(sessionId?: string | null): Promise<ShareData | null> {
  if (!sessionId) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const amountLabel =
      typeof session.amount_total === "number"
        ? `$${(session.amount_total / 100).toFixed(2)}`
        : "a donation";
    return {
      amountLabel,
      causeTitle: session.metadata?.causeTitle ?? undefined,
      businessName: session.metadata?.businessName ?? undefined,
    };
  } catch {
    return null;
  }
}

function buildTitle(data?: ShareData | null) {
  if (!data) return "Thanks for supporting Rack Up";
  const target = data.causeTitle ?? data.businessName ?? "a cause";
  return `Support ${target} with Rack Up`;
}

function buildDescription() {
  return "Join me in supporting a great cause while earning rewards!";
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: { session_id?: string };
}): Promise<Metadata> {
  const data = await fetchShareData(searchParams.session_id);
  const title = buildTitle(data);
  const description = buildDescription();
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function DonateSharePage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const data = await fetchShareData(searchParams.session_id);
  const title = buildTitle(data);
  const description = buildDescription();

  return (
    <PublicShell contentClassName="max-w-4xl space-y-6">
      <header className="space-y-3">
        <Badge color="emerald">Rack Up</Badge>
        <Heading level={1} className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {title}
        </Heading>
        <Text className="text-zinc-200">{description}</Text>
      </header>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-zinc-200 shadow-lg shadow-black/30">
        Join me in supporting a great cause while earning rewards!
      </div>

      <div className="flex flex-wrap gap-3">
        <Button href="/donate" color="emerald">
          Donate again
        </Button>
        <Button href="/rewards" outline>
          See rewards
        </Button>
      </div>
    </PublicShell>
  );
}
