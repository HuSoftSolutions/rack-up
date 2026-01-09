import PublicShell from "@/app/_components/PublicNav";
import { Badge } from "@/ui-kit/badge";
import { Button } from "@/ui-kit/button";
import { Heading } from "@/ui-kit/heading";
import { Text } from "@/ui-kit/text";
import { adminFirestore } from "@/lib/firebase/admin";

type CauseListEntry = {
  businessId: string;
  businessName: string;
  causeId: string;
  causeTitle: string;
  causeDescription?: string | null;
  causeLinkSlug: string;
  locations: Array<{ id: string; name: string; slug: string }>;
};

type LocationData = {
  name?: string;
  slug?: string;
  active?: boolean;
};

async function fetchActiveCauses(): Promise<CauseListEntry[]> {
  const businessSnap = await adminFirestore.collection("businesses").where("active", "==", true).get();

  const entries: CauseListEntry[] = [];

  for (const bizDoc of businessSnap.docs) {
    const businessId = bizDoc.id;
    const businessData = bizDoc.data() as { name?: string };

    const locationsSnap = await bizDoc.ref.collection("locations").where("active", "==", true).get();
    const locations = locationsSnap.docs.map((loc) => {
      const data = loc.data() as LocationData;
      return {
        id: loc.id,
        slug: data.slug ?? loc.id,
        name: data.name ?? loc.id,
      };
    });

    const linkSnap = await bizDoc.ref.collection("cause_links").get();
    for (const link of linkSnap.docs) {
      const linkData = link.data() as { causeId?: string; locationIds?: string[] };
      const causeId = linkData.causeId || link.id;
      const causeDoc = await adminFirestore.collection("causes").doc(causeId).get();
      if (!causeDoc.exists) continue;
      const cause = causeDoc.data() as { title?: string; description?: string | null; active?: boolean };
      if (cause.active === false) continue;

      const allowedLocations =
        linkData.locationIds && linkData.locationIds.length > 0
          ? locations.filter((loc) => linkData.locationIds?.includes(loc.id))
          : locations;

      if (allowedLocations.length === 0) continue;

      entries.push({
        businessId,
        businessName: businessData.name ?? businessId,
        causeId,
        causeTitle: cause.title ?? causeId,
        causeDescription: cause.description ?? null,
        causeLinkSlug: link.id,
        locations: allowedLocations.map((loc) => ({
          id: loc.id,
          slug: loc.slug,
          name: loc.name,
        })),
      });
    }
  }

  return entries;
}

export default async function DonateIndexPage() {
  const causes = await fetchActiveCauses();

  return (
    <PublicShell contentClassName="max-w-5xl space-y-8">
      <header className="space-y-3">
        <Badge color="emerald">Donate</Badge>
        <Heading level={1} className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Donate to a cause
        </Heading>
        <Text className="text-zinc-200">
          Select a cause and location to start a secure donation and earn RackUp points.
        </Text>
      </header>

      {causes.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-zinc-200 shadow-lg shadow-black/30">
          No active causes are available right now. Check back soon.
        </div>
      ) : (
        <div className="space-y-4">
          {causes.map((cause) => (
            <div
              key={`${cause.businessId}-${cause.causeLinkSlug}`}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/30"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge color="emerald">{cause.businessName}</Badge>
                    <Badge color="zinc">{cause.causeId}</Badge>
                  </div>
                  <Heading level={2} className="text-xl font-semibold text-white">
                    {cause.causeTitle}
                  </Heading>
                  {cause.causeDescription ? (
                    <Text className="text-zinc-300">{cause.causeDescription}</Text>
                  ) : null}
                </div>
                <Badge color="emerald">{cause.locations.length} location{cause.locations.length === 1 ? "" : "s"}</Badge>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {cause.locations.map((loc) => (
                  <Button
                    key={loc.id}
                    href={`/donate/${cause.businessId}/${cause.causeLinkSlug}/${loc.slug}`}
                    plain
                    className="justify-start rounded-xl border border-white/10 bg-white/5 text-left text-white hover:border-emerald-300/60 hover:bg-white/10"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">{loc.name}</span>
                      <span className="text-xs text-zinc-300">Donate at this location</span>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PublicShell>
  );
}
