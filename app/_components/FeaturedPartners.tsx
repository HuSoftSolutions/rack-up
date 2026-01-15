import Image from "next/image";

const partners = [
  {
    name: "Bunker",
    logo: "/partner_logos/Bunker_Logo_White_Registered_Trademark.png",
  },
];

export default function FeaturedPartners() {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/30">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-2xl font-semibold tracking-tight text-white">Featured partners</div>
        <div className="text-xs uppercase tracking-wide text-emerald-200">
          In-store experiences
        </div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {partners.map((partner) => (
          <div
            key={partner.name}
            className="flex items-center justify-center rounded-2xl border border-white/10 bg-black/30 px-6 py-4"
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
