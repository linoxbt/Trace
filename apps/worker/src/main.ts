// The background worker (spec section 10): every 30 s it releases lines whose
// review window lapsed, retries captures whose outcome is unknown, and
// reauthorizes holds past their honor period. A Postgres advisory lock keeps it
// to one running copy; /healthz reports its last tick.

import { createServer } from "node:http";
import { Db, migrate, recordHeartbeat } from "@trace/db";
import { consoleLogger, type Engine } from "@trace/engine";
import { PayPalClient } from "@trace/paypal";
import { loadConfig } from "./config.ts";
import { tick, type TickReport } from "./tick.ts";

const cfg = loadConfig(process.env);
const log = consoleLogger;
const db = new Db({ connectionString: cfg.databaseUrl, caCert: cfg.databaseCaCert, max: 4 });
await migrate(db);

const engine: Engine = {
  db,
  paypal: new PayPalClient({ clientId: cfg.paypalClientId, clientSecret: cfg.paypalClientSecret, baseUrl: cfg.paypalApiBase, partner: cfg.paypalPartner }),
  // The worker never stores or inspects photos.
  storage: {
    put: () => Promise.reject(new Error("worker has no photo storage")),
    get: () => Promise.reject(new Error("worker has no photo storage")),
    signedUrl: () => Promise.reject(new Error("worker has no photo storage")),
  },
  verifier: { model: "none", inspect: () => Promise.reject(new Error("worker has no verifier")) },
  settings: { webhookId: cfg.paypalWebhookId, demoMode: cfg.demoMode, confidenceThreshold: 0.8, brandName: "Trace" },
  now: () => new Date(),
  log,
};

let last: (TickReport & { at: string }) | null = null;
let errors = 0;
let stopping = false;

async function loop(): Promise<void> {
  while (!stopping) {
    const started = Date.now();
    try {
      const report = await db.withLock(727_002, async () => {
        const r = await tick(engine);
        await recordHeartbeat(db, { ...r });
        return r;
      });
      if (report) {
        last = { ...report, at: new Date().toISOString() };
        if (report.approved || report.released || report.retried || report.reauthorized.length || report.reauthorizeFailed.length || report.approvalsExpired) {
          log.info("tick", { ...report });
        }
      }
    } catch (err) {
      errors += 1;
      log.error("tick failed", { err: String(err) });
    }
    const wait = Math.max(0, cfg.tickMs - (Date.now() - started));
    await new Promise((r) => setTimeout(r, wait));
  }
}

const server = createServer(async (req, res) => {
  if (req.url !== "/healthz") {
    res.writeHead(404).end();
    return;
  }
  let dbOk = false;
  try {
    await db.query("select 1");
    dbOk = true;
  } catch {}
  const stale = !last || Date.now() - Date.parse(last.at) > cfg.tickMs * 4;
  const ok = dbOk && !stale;
  res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok, db: dbOk, lastTick: last, errors }));
});
server.listen(cfg.port, () => log.info("worker up", { port: cfg.port, tickMs: cfg.tickMs }));

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopping = true;
    server.close();
    setTimeout(() => db.end().finally(() => process.exit(0)), 1000);
  });
}

await loop();
