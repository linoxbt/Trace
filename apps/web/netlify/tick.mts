// The worker's periodic jobs as a Netlify scheduled function, once a minute
// (spec section 10 asks for every 30 s; Netlify's finest schedule is 1 min;
// the schedule is in netlify.toml). Each run: retry captures whose outcome is
// unknown, release lines whose review window lapsed, reauthorize holds past
// their honor period. A Postgres advisory lock keeps overlapping runs from
// doing the same work.
//
// The build bundles this file, workspace packages and all, into
// netlify/functions/tick.mjs: Netlify's own packager left the workspace's
// TypeScript imports unbundled, and the function failed to load.

/// <reference types="@netlify/functions" />

import { Db } from "@trace/db";
import { consoleLogger, type Engine } from "@trace/engine/worker";
import { PayPalClient } from "@trace/paypal";
import { tick } from "../../worker/src/tick.ts";

const REQUIRED = ["DATABASE_URL", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"] as const;

export default async () => {
  const env = (k: string) => Netlify.env.get(k) ?? undefined;
  const missing = REQUIRED.filter((k) => !env(k));
  if (missing.length) {
    consoleLogger.warn("tick skipped: config incomplete", { missing });
    return;
  }
  const base = env("PAYPAL_API_BASE") ?? "https://api-m.sandbox.paypal.com";
  const db = new Db({ connectionString: env("DATABASE_URL")!, caCert: env("DATABASE_CA_CERT"), max: 2 });
  const noPhotos = () => Promise.reject(new Error("the scheduled worker has no photo storage"));
  const engine: Engine = {
    db,
    paypal: new PayPalClient({ clientId: env("PAYPAL_CLIENT_ID")!, clientSecret: env("PAYPAL_CLIENT_SECRET")!, baseUrl: base, timeoutMs: 15_000 }),
    storage: { put: noPhotos, get: noPhotos, signedUrl: noPhotos },
    verifier: { model: "none", inspect: () => Promise.reject(new Error("the scheduled worker has no verifier")) },
    settings: { webhookId: env("PAYPAL_WEBHOOK_ID")!, demoMode: env("DEMO_MODE") === "true", confidenceThreshold: 0.8, brandName: "Trace" },
    now: () => new Date(),
    log: consoleLogger,
  };
  try {
    const report = await db.withLock(727_002, () => tick(engine));
    if (report === null) consoleLogger.info("tick skipped: another run holds the lock");
    else if (report.approved || report.released || report.retried || report.reauthorized.length || report.reauthorizeFailed.length) {
      consoleLogger.info("tick", { ...report });
    }
  } catch (err) {
    consoleLogger.error("tick failed", { err: String(err) });
  } finally {
    await db.end();
  }
};

