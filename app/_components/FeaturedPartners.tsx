import Image from "next/image";

const partners = [
  {
    name: "Bunker",
    logo: "/partner_logos/Bunker_Logo_White_Registered_Trademark.png",
  },
];

export default function FeaturedPartners() {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight text-white">Featured partners</h2>
        <span className="text-sm text-emerald-300">In-store experiences</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {partners.map((partner) => (
          <div
            key={partner.name}
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
    </section>
  );
}
