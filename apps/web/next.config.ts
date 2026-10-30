import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const paypal = "https://www.paypal.com https://www.sandbox.paypal.com https://*.paypal.com https://*.paypalobjects.com";
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} ${paypal}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com`,
  `img-src 'self' data: blob: ${supabase} ${paypal}`,
  `connect-src 'self' ${supabase} ${supabase.replace("https://", "wss://")} ${paypal}`,
  `frame-src ${paypal}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const config: NextConfig = {
  // The workspace packages ship TypeScript source.
  transpilePackages: ["@trace/core", "@trace/db", "@trace/engine", "@trace/eval", "@trace/paypal"],
  serverExternalPackages: ["sharp", "pg"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The camera and location are used by this origin only.
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(self)" },
        ],
      },
    ];
  },
};

export default config;
