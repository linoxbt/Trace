import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Trace: payment that follows proof",
  description: "Home-repair payments held with PayPal and released line by line, only for work an AI has verified from photos.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b7f74" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        {/* Mobile-first: on wide screens the app sits in a centred phone-width column. */}
        <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-paper sm:my-6 sm:min-h-[calc(100dvh-3rem)] sm:rounded-[28px] sm:border sm:border-line sm:shadow-xl">
          {children}
        </div>
      </body>
    </html>
  );
}
