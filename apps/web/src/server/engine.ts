import "server-only";
import { Db } from "@trace/db";
import { ClaudeDisputeDrafter, ClaudeScopeDrafter, ClaudeRuleCompiler, ClaudeTextScanner, ClaudeVerifier, consoleLogger, EngineError, PostgresStorage, ResendMailer, type Engine, type Verifier } from "@trace/engine";
import { createPayPalClient, type PayPalApi } from "@trace/paypal";
import { env } from "./env";
import { FirstThatWorks, ToolkitDisputeDrafter } from "./dispute-agent";

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
  // Supabase's session pooler allows 15 connections in all, and Netlify runs
  // several copies of this function at once (more during a deploy): each
  // holds at most 3 (some flows use a second connection inside a
  // transaction), and lets idle ones go after 5 s.
  const db = new Db({ connectionString: e.DATABASE_URL, caCert: e.DATABASE_CA_CERT, max: 3, idleTimeoutMs: 5_000 });
  g.__traceEngine = {
    db,
    paypal:
      e.PAYPAL_CLIENT_ID && e.PAYPAL_CLIENT_SECRET && e.PAYPAL_WEBHOOK_ID
        ? createPayPalClient({
            http: e.PAYPAL_HTTP,
            clientId: e.PAYPAL_CLIENT_ID,
            clientSecret: e.PAYPAL_CLIENT_SECRET,
            baseUrl: e.PAYPAL_API_BASE,
            ...(e.PAYPAL_PARTNER_MERCHANT_ID ? { partner: { merchantId: e.PAYPAL_PARTNER_MERCHANT_ID, bnCode: e.PAYPAL_BN_CODE } } : {}),
          })
        : paypalNotYet,
    storage: new PostgresStorage(db),
    verifier: e.ANTHROPIC_API_KEY ? new ClaudeVerifier({ apiKey: e.ANTHROPIC_API_KEY, model: e.VERIFIER_MODEL }) : notYet,
    ...(e.ANTHROPIC_API_KEY
      ? {
          scanner: new ClaudeTextScanner({ apiKey: e.ANTHROPIC_API_KEY }),
          compiler: new ClaudeRuleCompiler({ apiKey: e.ANTHROPIC_API_KEY }),
          // PayPal's Agent Toolkit reads the dispute from PayPal first; the plain drafter is the fallback.
          drafter:
            e.PAYPAL_CLIENT_ID && e.PAYPAL_CLIENT_SECRET
              ? new FirstThatWorks([
                  new ToolkitDisputeDrafter({ anthropicKey: e.ANTHROPIC_API_KEY, paypalClientId: e.PAYPAL_CLIENT_ID, paypalClientSecret: e.PAYPAL_CLIENT_SECRET, sandbox: e.PAYPAL_API_BASE.includes("sandbox") }),
                  new ClaudeDisputeDrafter({ apiKey: e.ANTHROPIC_API_KEY }),
                ])
              : new ClaudeDisputeDrafter({ apiKey: e.ANTHROPIC_API_KEY }),
          scopeDrafter: new ClaudeScopeDrafter({ apiKey: e.ANTHROPIC_API_KEY }),
        }
      : {}),
    ...(e.RESEND_API_KEY && e.MAIL_FROM ? { mailer: new ResendMailer(e.RESEND_API_KEY, e.MAIL_FROM.includes("<") ? e.MAIL_FROM : `Trace <${e.MAIL_FROM.trim()}>`) } : {}),
    settings: { webhookId: e.PAYPAL_WEBHOOK_ID ?? "", demoMode: e.DEMO_MODE === "true", sandbox: e.PAYPAL_API_BASE.includes("sandbox"), confidenceThreshold: 0.8, brandName: "Trace" },
    now: () => new Date(),
    log: consoleLogger,
  };
  return g.__traceEngine;
}
