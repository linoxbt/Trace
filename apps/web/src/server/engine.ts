import "server-only";
import { Db } from "@trace/db";
import { ClaudeRuleCompiler, ClaudeTextScanner, ClaudeVerifier, consoleLogger, EngineError, PostgresStorage, type Engine, type Verifier } from "@trace/engine";
import { PayPalClient, type PayPalApi } from "@trace/paypal";
import { env } from "./env";

/** Without an Anthropic key, proofs are refused rather than judged by anything else. */
const notYet: Verifier = {
  model: "none",
  inspect: () => Promise.reject(new Error("the photo verifier is not configured yet")),
};

/** Until PayPal keys are set, every PayPal call says so instead of failing obscurely. */
const paypalNotYet = new Proxy({} as PayPalApi, {
  // `then` stays undefined so the stand-in is never mistaken for a promise.
  get: (_t, prop) => (prop === "then" ? undefined : () => Promise.reject(new EngineError("paypal_not_configured", "PayPal isn't connected yet; add the PayPal keys and redeploy", 503))),
});

const g = globalThis as unknown as { __traceEngine?: Engine };

/** One engine per server process (dev hot reload keeps the same pool). */
export function engine(): Engine {
  if (g.__traceEngine) return g.__traceEngine;
  const e = env();
  const db = new Db({ connectionString: e.DATABASE_URL, caCert: e.DATABASE_CA_CERT, max: 5 });
  g.__traceEngine = {
    db,
    paypal:
      e.PAYPAL_CLIENT_ID && e.PAYPAL_CLIENT_SECRET && e.PAYPAL_WEBHOOK_ID
        ? new PayPalClient({ clientId: e.PAYPAL_CLIENT_ID, clientSecret: e.PAYPAL_CLIENT_SECRET, baseUrl: e.PAYPAL_API_BASE })
        : paypalNotYet,
    storage: new PostgresStorage(db),
    verifier: e.ANTHROPIC_API_KEY ? new ClaudeVerifier({ apiKey: e.ANTHROPIC_API_KEY, model: e.VERIFIER_MODEL }) : notYet,
    ...(e.ANTHROPIC_API_KEY
      ? { scanner: new ClaudeTextScanner({ apiKey: e.ANTHROPIC_API_KEY }), compiler: new ClaudeRuleCompiler({ apiKey: e.ANTHROPIC_API_KEY }) }
      : {}),
    settings: { webhookId: e.PAYPAL_WEBHOOK_ID ?? "", demoMode: e.DEMO_MODE === "true", confidenceThreshold: 0.8, brandName: "Trace" },
    now: () => new Date(),
    log: consoleLogger,
  };
  return g.__traceEngine;
}
