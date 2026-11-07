import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (src/app/fonts), so a build never depends on reaching Google Fonts.
const outfit = localFont({ src: "./fonts/outfit-latin-wght-normal.woff2", weight: "100 900", variable: "--font-outfit", display: "swap" });
const figtree = localFont({ src: "./fonts/figtree-latin-wght-normal.woff2", weight: "300 900", variable: "--font-figtree", display: "swap" });
const mono = localFont({ src: "./fonts/jetbrains-mono-latin-wght-normal.woff2", weight: "100 800", variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "https://trace-proof.netlify.app"),
  title: { default: "Trace — PayPal holds it. AI checks it. Proof releases it.", template: "%s · Trace" },
  description:
    "Trace holds a client's payment with PayPal and releases it line by line, only when AI verifies a photo that proves each part of the job is done.",
  openGraph: {
    title: "Trace — PayPal holds it. AI checks it. Proof releases it.",
    description: "Trace holds a client's payment with PayPal and releases it line by line, only when AI verifies a photo that proves each part of the job is done.",
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
