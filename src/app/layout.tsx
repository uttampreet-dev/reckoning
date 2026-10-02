import type { Metadata, Viewport } from "next";
import { Anek_Devanagari, Fraunces, IBM_Plex_Mono, Instrument_Sans, Rozha_One } from "next/font/google";
import { LanguageProvider } from "@/lib/i18n";
import "./globals.css";

const anekDeva = Anek_Devanagari({ subsets: ["devanagari"], variable: "--font-anek-deva", axes: ["wdth"], display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", axes: ["opsz"], style: ["normal", "italic"], display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });
// Hindi headlines: a high-contrast Devanagari display face that stands next to Fraunces
const rozha = Rozha_One({ subsets: ["devanagari"], weight: "400", variable: "--font-rozha", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Reckoning — settle a tip channel's account before you pay for it",
  description:
    "Reckoning reads every call a stock-tip channel has posted and replays each one against exchange prices. It shows the record the channel never posts: the calls that expired, the money a follower would have left, and what the prices cannot confirm.",
};

export const viewport: Viewport = { themeColor: "#f3eee2", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anekDeva.variable} ${plexMono.variable} ${fraunces.variable} ${instrument.variable} ${rozha.variable}`}>
      <body className="grain antialiased">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
