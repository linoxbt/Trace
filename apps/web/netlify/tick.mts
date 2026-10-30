// The worker's periodic jobs as a Netlify scheduled function, once a minute
// (spec section 10 asks for every 30 s; Netlify's finest schedule is 1 min;
// the schedule is in netlify.toml). Each run: apply any migration not yet
// applied (the build can't reach the database, so a deploy's migrations land
// here within a minute), retry captures whose outcome is unknown, release
// lines whose review window lapsed, reauthorize holds past their honor
// period, and record a heartbeat. A Postgres advisory lock keeps overlapping
// runs from doing the same work.
//
// The build bundles this file, workspace packages and all, into
// netlify/functions/tick.mjs: Netlify's own packager left the workspace's
// TypeScript imports unbundled, and the function failed to load.

/// <reference types="@netlify/functions" />

import { createHmac } from "node:crypto";
import { Db, migrate, recordHeartbeat } from "@trace/db";
import { consoleLogger, type Engine } from "@trace/engine/worker";
import { PayPalClient } from "@trace/paypal";
import { tick } from "../../worker/src/tick.ts";
import { MIGRATIONS } from "./migrations.gen.ts";

const REQUIRED = ["DATABASE_URL", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"] as const;

export default async () => {
  const env = (k: string) => Netlify.env.get(k) ?? undefined;
  const missing = REQUIRED.filter((k) => !env(k));
  if (missing.length) {
    consoleLogger.warn("tick skipped: config incomplete", { missing });
    return;
  }
  const base = env("PAYPAL_API_BASE") ?? "https://api-m.sandbox.paypal.com";
  const partnerId = env("PAYPAL_PARTNER_MERCHANT_ID");
  const partner = partnerId ? { merchantId: partnerId, bnCode: env("PAYPAL_BN_CODE") } : undefined;
  const db = new Db({ connectionString: env("DATABASE_URL")!, caCert: env("DATABASE_CA_CERT"), max: 2 });
  const noPhotos = () => Promise.reject(new Error("the scheduled worker has no photo storage"));
  const engine: Engine = {
    db,
    paypal: new PayPalClient({ clientId: env("PAYPAL_CLIENT_ID")!, clientSecret: env("PAYPAL_CLIENT_SECRET")!, baseUrl: base, timeoutMs: 15_000, partner }),
    storage: { put: noPhotos, get: noPhotos, signedUrl: noPhotos },
    verifier: { model: "none", inspect: () => Promise.reject(new Error("the scheduled worker has no verifier")) },
    settings: { webhookId: env("PAYPAL_WEBHOOK_ID")!, demoMode: env("DEMO_MODE") === "true", confidenceThreshold: 0.8, brandName: "Trace" },
    now: () => new Date(),
    log: consoleLogger,
  };
  try {
    const applied = await migrate(db, MIGRATIONS);
    if (applied.length) consoleLogger.info("migrations applied", { applied });
  } catch (err) {
    // Keep going: the jobs below only need the tables that already exist.
    consoleLogger.error("migrations failed", { err: String(err) });
  }
  try {
    const report = await db.withLock(727_002, async () => {
      const r = await tick(engine);
      await recordHeartbeat(db, { ...r });
      return r;
    });
    if (report === null) consoleLogger.info("tick skipped: another run holds the lock");
    else if (report.approved || report.released || report.retried || report.reauthorized.length || report.reauthorizeFailed.length || report.approvalsExpired) {
      consoleLogger.info("tick", { ...report });
    }
  } catch (err) {
    consoleLogger.error("tick failed", { err: String(err) });
  } finally {
    await db.end();
  }
  await stepEvals(env("URL"), env("PAYPAL_CLIENT_SECRET")!);
};

/**
 * Nudges the evals along: the site's /api/eval/step judges one case per call
 * with the production models, and stops once each run is done. It runs in the
 * site's function (60 s limit, with the model key and image tools), not here.
 */
async function stepEvals(site: string | undefined, secret: string): Promise<void> {
  if (!site) return;
  const key = createHmac("sha256", secret).update("trace-eval-step").digest("hex");
  try {
    const res = await fetch(new URL("/api/eval/step", site), { method: "POST", headers: { "x-trace-eval": key }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) consoleLogger.warn("eval step answered", { status: res.status });
  } catch (err) {
    // A slow step keeps running on the site after this gives up waiting.
    if (!(err instanceof Error && err.name === "TimeoutError")) consoleLogger.warn("eval step failed", { err: String(err) });
  }
}

