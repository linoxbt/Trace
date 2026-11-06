import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as store from "../src/index.ts";
import { migrate, readMigrations, withoutSslParams, type Db } from "../src/index.ts";
import { freshDb, makeUser, TEST_DATABASE_URL } from "../src/testing.ts";

const acceptance = { criterion: "c", must_show: ["a"], must_not_show: [], framing: "f" };

describe.skipIf(!TEST_DATABASE_URL)("database", () => {
  let db: Db;
  beforeAll(async () => {
    db = await freshDb();
  });
  afterAll(() => db?.end());

  async function job() {
    const trades = await makeUser(db, "trades");
    const home = await makeUser(db, "home");
    const j = await store.insertJob(db, { tradesId: trades, homeownerEmail: "Home@Example.test", address: "1 Test Rd", homeownerId: home });
    return { trades, home, job: j };
  }

  it("lets one worker hold the lease at a time, and frees it after, or once it lapses", async () => {
    let inside = 0;
    const slow = () => db.withLock("test-lease", async () => {
      inside += 1;
      await new Promise((r) => setTimeout(r, 150));
      return "ran";
    });
    const results = await Promise.all([slow(), slow(), slow()]);
    expect(results.filter((r) => r === "ran")).toHaveLength(1);
    expect(inside).toBe(1);
    expect(await db.withLock("test-lease", async () => "again")).toBe("again");
    // A holder that died: its lease lapses.
    await db.query("insert into worker_leases (name, holder, until) values ('dead', 'x', now() - interval '1 second')");
    expect(await db.withLock("dead", async () => "taken over")).toBe("taken over");
  });

  it("names the newest migration file as LATEST_MIGRATION", async () => {
    expect(store.LATEST_MIGRATION).toBe((await readMigrations()).map((m) => m.name).sort().at(-1));
  });

  it("migrates once and is idempotent", async () => {
    expect(await migrate(db)).toEqual([]);
    const { rows } = await db.query("select name from trace_schema_migrations");
    expect(rows.map((r) => r.name).sort()).toEqual(["001_init.sql", "002_photo_blobs.sql", "003_tripwire.sql", "004_payee.sql", "005_job_category.sql", "006_proof_types.sql", "007_change_orders.sql", "008_realtime.sql", "009_heartbeat.sql", "010_eval.sql", "011_lock_down.sql", "012_model_usage.sql", "013_refunds.sql", "014_capture_balances.sql", "015_webhook_claims.sql", "016_rule_drafts.sql", "017_proof_retention.sql", "018_worker_lease.sql", "019_price_suggestions.sql", "020_indexes.sql", "021_webhook_backoff.sql"]);
  });

  it("takes migrations as data too, as the scheduled function carries them, and records the worker's heartbeat", async () => {
    expect(await migrate(db, await readMigrations())).toEqual([]);
    await store.recordHeartbeat(db, { released: 1 });
    const s = await store.systemStatus(db);
    expect(s.migration).toBe("021_webhook_backoff.sql");
    expect(Date.now() - s.lastTickAt!.getTime()).toBeLessThan(60_000);
  });

  it("never has a new migration alter a table an earlier one created: production runs them as a role that doesn't own those", async () => {
    // 001 to 010 were applied by Supabase's postgres role, which owns their tables.
    const OWNER_APPLIED = "010";
    const created = new Map<string, string>();
    for (const m of await readMigrations()) {
      const sql = m.sql.replace(/--.*$/gm, "");
      if (m.name.slice(0, 3) > OWNER_APPLIED) {
        for (const [, table] of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?(\w+)/gi)) {
          const by = created.get(table!.toLowerCase());
          if (by && by.slice(0, 3) <= OWNER_APPLIED) expect.fail(`${m.name} alters ${table}, created by ${by}: add a new table or view instead`);
        }
      }
      for (const [, table] of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)/gi)) created.set(table!.toLowerCase(), m.name);
    }
  });

  it("keeps every public table behind row-level security, read-only to the public roles", async () => {
    const { rows } = await db.query<{ table: string; rls: boolean; anon: boolean; writes: boolean }>(
      `select c.relname as table, c.relrowsecurity as rls,
              has_table_privilege('anon', c.oid, 'select, insert, update, delete') as anon,
              has_table_privilege('authenticated', c.oid, 'insert, update, delete, truncate') as writes
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by 1`,
    );
    expect(rows.map((r) => r.table)).toContain("trace_schema_migrations");
    expect(rows.filter((r) => !r.rls).map((r) => r.table)).toEqual([]);
    expect(rows.filter((r) => r.anon).map((r) => r.table)).toEqual([]);
    expect(rows.filter((r) => r.writes).map((r) => r.table)).toEqual([]);
  });

  it("lowercases the homeowner email and enforces money checks", async () => {
    const { job: j } = await job();
    expect(j.homeowner_email).toBe("home@example.test");
    await expect(store.replaceLines(db, j.id, [{ code: "L1", title: "t", priceCents: 0, acceptance, verifiableByPhoto: true }])).rejects.toThrow(/price_cents/);
  });

  it("keeps the timeline append-only, but lets a whole job go", async () => {
    const { job: j } = await job();
    await store.appendEvent(db, { jobId: j.id, actor: "system", type: "X" });
    await expect(db.query("update events set type = 'Y' where job_id = $1", [j.id])).rejects.toThrow(/append-only/);
    await expect(db.query("delete from events where job_id = $1", [j.id])).rejects.toThrow(/append-only/);
    await db.query("delete from jobs where id = $1", [j.id]);
    expect((await store.getEvents(db, j.id)).length).toBe(0);
  });

  it("spends a capture token once, within 120 s, for its own line and person", async () => {
    const { trades, home, job: j } = await job();
    const [line] = await store.replaceLines(db, j.id, [{ code: "L1", title: "t", priceCents: 100, acceptance, verifiableByPhoto: true }]);
    const t0 = new Date("2026-11-03T10:00:00Z");
    await store.issueCaptureToken(db, { token: "tok1", lineId: line!.id, issuedTo: trades, deviceId: null, now: t0 });
    const at = (s: number) => new Date(t0.getTime() + s * 1000);
    expect(await store.consumeCaptureToken(db, { token: "tok1", lineId: line!.id, userId: home, now: at(5), ttlS: 120 })).toBe(false);
    expect(await store.consumeCaptureToken(db, { token: "tok1", lineId: line!.id, userId: trades, now: at(5), ttlS: 120 })).toBe(true);
    expect(await store.consumeCaptureToken(db, { token: "tok1", lineId: line!.id, userId: trades, now: at(6), ttlS: 120 })).toBe(false);
    await store.issueCaptureToken(db, { token: "tok2", lineId: line!.id, issuedTo: trades, deviceId: null, now: t0 });
    expect(await store.consumeCaptureToken(db, { token: "tok2", lineId: line!.id, userId: trades, now: at(121), ttlS: 120 })).toBe(false);
  });

  it("finds the nearest stored photo by dHash distance", async () => {
    const { job: j } = await job();
    const base = { job_id: j.id, line_id: null, kind: "before" as const, storage_path: "p", lat: null, lng: null, gps_accuracy_m: null, capture_token: null, device_id: null, sample: false, taken_at: new Date() };
    const a = await store.insertPhoto(db, { ...base, dhash: "00000000000000ff" });
    await store.insertPhoto(db, { ...base, dhash: "0000000000000fff" });
    expect(await store.nearestOtherHamming(db, "00000000000000ff", [a.id])).toBe(4);
    expect(await store.nearestOtherHamming(db, "00000000000000ff", [])).toBe(0);
  });

  it("de-duplicates webhooks on PayPal's event ID until processed", async () => {
    const e = { id: "WH-1", type: "T", payload: { a: 1 } };
    expect(await db.tx((q) => store.claimWebhookEvent(q, e))).toBe(true);
    await store.finishWebhookEvent(db, "WH-1", "boom");
    // A failed run hands it back after a pause.
    await db.query("update webhook_claims set claimed_until = now() - interval '1 second' where paypal_event_id = 'WH-1'");
    expect(await db.tx((q) => store.claimWebhookEvent(q, e))).toBe(true);
    await store.finishWebhookEvent(db, "WH-1", null);
    expect(await db.tx((q) => store.claimWebhookEvent(q, e))).toBe(false);
  });

  it("shows a job only to its two parties under row-level security", async () => {
    const { trades, home, job: j } = await job();
    await store.replaceLines(db, j.id, [{ code: "L1", title: "t", priceCents: 100, acceptance, verifiableByPhoto: true }]);
    await store.appendEvent(db, { jobId: j.id, actor: "system", type: "X" });
    const stranger = await makeUser(db, "stranger");
    const seen = async (uid: string, table: string) =>
      db.tx(async (q) => {
        await q.query("set local role authenticated");
        await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid })]);
        const { rows } = await q.query(`select count(*)::int as n from ${table} where ${table === "jobs" ? "id" : "job_id"} = $1`, [j.id]);
        return rows[0].n as number;
      });
    for (const table of ["jobs", "lines", "events"]) {
      expect(await seen(trades, table)).toBe(1);
      expect(await seen(home, table)).toBe(1);
      expect(await seen(stranger, table)).toBe(0);
    }
    // A party can read their job but never write it: writes go through the server.
    const written = db.tx(async (q) => {
      await q.query("set local role authenticated");
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: trades })]);
      return (await q.query("update jobs set status = 'COMPLETED' where id = $1", [j.id])).rowCount;
    });
    await expect(written).rejects.toThrow(/permission denied/);
    expect((await store.mustGetJob(db, j.id)).status).toBe("DRAFT");
    const tokens = await db.tx(async (q) => {
      await q.query("set local role authenticated");
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: trades })]);
      return (await q.query("select count(*)::int as n from capture_tokens")).rows[0].n;
    });
    expect(tokens).toBe(0);
  });
});

describe("withoutSslParams", () => {
  it("drops the URL's ssl settings so a pinned CA is used, and keeps the rest", () => {
    const out = withoutSslParams("postgresql://trace_app.ref:pw@host.example:5432/postgres?sslmode=require&application_name=trace");
    expect(out).toBe("postgresql://trace_app.ref:pw@host.example:5432/postgres?application_name=trace");
  });
  it("leaves something that isn't a URL alone", () => {
    expect(withoutSslParams("not a url")).toBe("not a url");
  });
});
