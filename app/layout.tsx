import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Rack Up",
  description: "Earn points, redeem rewards, and support a charity.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-gradient-to-b from-black via-zinc-950 to-[#0b0b0f] text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
