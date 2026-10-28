import type { Metadata, Viewport } from "next";
import { Figtree, JetBrains_Mono, Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-outfit" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "https://trace-proof.netlify.app"),
  title: { default: "Trace — Payment that follows proof", template: "%s · Trace" },
  description:
    "Trace holds a homeowner's payment with PayPal and releases it line by line, only when AI confirms the work from photos taken on site.",
  openGraph: {
    title: "Trace — Payment that follows proof",
    description: "Home-repair payments held with PayPal and released line by line, only for verified work.",
    type: "website",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f0eff4" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${figtree.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
