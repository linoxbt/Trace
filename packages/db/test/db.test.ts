import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as store from "../src/index.ts";
import { migrate, withoutSslParams, type Db } from "../src/index.ts";
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

  it("migrates once and is idempotent", async () => {
    expect(await migrate(db)).toEqual([]);
    const { rows } = await db.query("select name from trace_migrations");
    expect(rows.map((r) => r.name).sort()).toEqual(["001_init.sql", "002_photo_blobs.sql", "003_tripwire.sql", "004_payee.sql", "005_job_category.sql", "006_proof_types.sql", "007_change_orders.sql", "008_realtime.sql"]);
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
    const written = await db.tx(async (q) => {
      await q.query("set local role authenticated");
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: trades })]);
      return (await q.query("update jobs set status = 'COMPLETED' where id = $1", [j.id])).rowCount;
    });
    expect(written).toBe(0);
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
