import Image from "next/image";

export type PartnerLogo = {
  name: string;
  logo: string;
};

export default function FeaturedPartners({ partners }: { partners: PartnerLogo[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight text-white">Featured partners</h2>
        <span className="text-sm text-emerald-300">In-store experiences</span>
      </div>
      {partners.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-400">
          Partner logos will appear here once uploaded.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {partners.map((partner) => (
            <div
              key={`${partner.name}-${partner.logo}`}
              className="group flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:-translate-y-1 hover:border-emerald-300/60 hover:shadow-2xl"
            >
              <Image
                src={partner.logo}
                alt={`${partner.name} logo`}
                width={420}
                height={200}
                className="h-16 w-auto object-contain sm:h-20"
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
