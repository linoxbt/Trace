import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_CA_CERT: z.string().optional(),
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PAYPAL_WEBHOOK_ID: z.string().min(1),
  PAYPAL_API_BASE: z.url().default("https://api-m.sandbox.paypal.com"),
  PAYPAL_PARTNER_MERCHANT_ID: z.string().min(1).optional(),
  PAYPAL_BN_CODE: z.string().min(1).optional(),
  DEMO_MODE: z.enum(["true", "false"]).default("false"),
  WORKER_TICK_MS: z.coerce.number().int().min(1000).default(30_000),
  PORT: z.coerce.number().int().default(8080),
});

export interface WorkerConfig {
  databaseUrl: string;
  databaseCaCert: string | undefined;
  paypalClientId: string;
  paypalClientSecret: string;
  paypalWebhookId: string;
  paypalApiBase: string;
  /** Trace as a PayPal partner (refunds and disputes act for the tradesperson's account). */
  paypalPartner: { merchantId: string; bnCode?: string } | undefined;
  demoMode: boolean;
  tickMs: number;
  port: number;
}

export function loadConfig(env: Record<string, string | undefined>): WorkerConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`worker config is incomplete: ${missing}`);
  }
  const e = parsed.data;
  if (e.DEMO_MODE === "true" && !e.PAYPAL_API_BASE.includes("sandbox")) throw new Error("DEMO_MODE is for the PayPal sandbox only");
  return {
    databaseUrl: e.DATABASE_URL,
    databaseCaCert: e.DATABASE_CA_CERT,
    paypalClientId: e.PAYPAL_CLIENT_ID,
    paypalClientSecret: e.PAYPAL_CLIENT_SECRET,
    paypalWebhookId: e.PAYPAL_WEBHOOK_ID,
    paypalApiBase: e.PAYPAL_API_BASE,
    paypalPartner: e.PAYPAL_PARTNER_MERCHANT_ID ? { merchantId: e.PAYPAL_PARTNER_MERCHANT_ID, bnCode: e.PAYPAL_BN_CODE } : undefined,
    demoMode: e.DEMO_MODE === "true",
    tickMs: e.WORKER_TICK_MS,
    port: e.PORT,
  };
}
