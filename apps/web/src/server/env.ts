import "server-only";
import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_CA_CERT: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Optional so sign-in and drafting work before PayPal is connected; the
  // PayPal steps themselves refuse until all three are set.
  PAYPAL_CLIENT_ID: z.string().min(1).optional(),
  PAYPAL_CLIENT_SECRET: z.string().min(1).optional(),
  PAYPAL_WEBHOOK_ID: z.string().min(1).optional(),
  PAYPAL_API_BASE: z.url().default("https://api-m.sandbox.paypal.com"),
  // Trace as a PayPal partner: tradespeople link their own accounts and are
  // paid directly. Without the partner merchant ID nobody can link, so no
  // real job can be sent.
  PAYPAL_PARTNER_MERCHANT_ID: z.string().min(1).optional(),
  PAYPAL_BN_CODE: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  VERIFIER_MODEL: z.string().min(1).optional(),
  DEMO_MODE: z.enum(["true", "false"]).default("false"),
  APP_URL: z.url(),
});

export type ServerEnv = z.infer<typeof Env>;

let cached: ServerEnv | null = null;

/** Read and check the server's environment once. Missing values fail loudly, never half-configured. */
export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`server config is incomplete: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  if (parsed.data.DEMO_MODE === "true" && !parsed.data.PAYPAL_API_BASE.includes("sandbox")) {
    throw new Error("DEMO_MODE is for the PayPal sandbox only");
  }
  cached = parsed.data;
  return cached;
}
