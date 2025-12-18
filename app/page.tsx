import LandingAuthActions from "@/app/_components/LandingAuthActions";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 font-sans dark:bg-black">
      <main className="w-full max-w-3xl rounded-2xl border border-black/10 bg-white p-10 shadow-sm dark:border-white/10 dark:bg-black">
        <h1 className="text-3xl font-semibold tracking-tight">
          Rack Up (WIP)
        </h1>
        <p className="mt-3 max-w-2xl text-zinc-600 dark:text-zinc-400">
          Earn points, redeem rewards, and donate to charity through a Stripe-powered
          checkout. This landing page is intentionally minimal for now.
        </p>
        <LandingAuthActions />
      </main>
    </div>
  );
}
