import "server-only";
import { Db } from "@trace/db";
import { ClaudeVerifier, consoleLogger, PostgresStorage, type Engine, type Verifier } from "@trace/engine";
import { PayPalClient } from "@trace/paypal";
import { env } from "./env";

/** Without an Anthropic key, proofs are refused rather than judged by anything else. */
const notYet: Verifier = {
  model: "none",
  inspect: () => Promise.reject(new Error("the photo verifier is not configured yet")),
};

const g = globalThis as unknown as { __traceEngine?: Engine };

/** One engine per server process (dev hot reload keeps the same pool). */
export function engine(): Engine {
  if (g.__traceEngine) return g.__traceEngine;
  const e = env();
  const db = new Db({ connectionString: e.DATABASE_URL, caCert: e.DATABASE_CA_CERT, max: 5 });
  g.__traceEngine = {
    db,
    paypal: new PayPalClient({ clientId: e.PAYPAL_CLIENT_ID, clientSecret: e.PAYPAL_CLIENT_SECRET, baseUrl: e.PAYPAL_API_BASE }),
    storage: new PostgresStorage(db),
    verifier: e.ANTHROPIC_API_KEY ? new ClaudeVerifier({ apiKey: e.ANTHROPIC_API_KEY, model: e.VERIFIER_MODEL }) : notYet,
    settings: { webhookId: e.PAYPAL_WEBHOOK_ID, demoMode: e.DEMO_MODE === "true", confidenceThreshold: 0.8, brandName: "Trace" },
    now: () => new Date(),
    log: consoleLogger,
  };
  return g.__traceEngine;
}
