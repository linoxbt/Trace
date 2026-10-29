import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import {
  assertDemoBudget,
  authorizeJob,
  createDemoJob,
  createOrder,
  DEMO_MODEL_CALLS_PER_HOUR,
  HISTORY_ADDRESS,
  submitProof,
  type DemoAssets,
} from "../src/index.ts";
import { makeUser, testEngine, testPhoto, type TestEngine } from "../src/testing.ts";

describe.skipIf(!TEST_DATABASE_URL)("engine: judge mode demo job", () => {
  let e: TestEngine;
  let assets: DemoAssets;
  beforeEach(async () => {
    e = await testEngine();
    assets = { before: { L1: await testPhoto(901), L2: await testPhoto(902), L3: await testPhoto(903), L4: await testPhoto(904) } };
  });
  afterEach(() => e.db.end());

  it("gives the visitor a private $420 job, sent for approval, with a before-photo per line", async () => {
    const me = await makeUser(e.db, "judge");
    const job = await createDemoJob(e, { id: me, email: null }, assets);
    expect(job).toMatchObject({ demo: true, trades_id: me, homeowner_id: me, status: "AWAITING_APPROVAL" });
    const lines = await store.getLines(e.db, job.id);
    expect(lines.map((l) => [l.code, l.price_cents])).toEqual([["L1", 12000], ["L2", 9000], ["L3", 10000], ["L4", 11000]]);
    for (const l of lines) expect((await store.beforePhotoFor(e.db, l))?.line_id).toBe(l.id);
  });

  it("seeds one sample history of 30 decisions the real evaluator made", async () => {
    const me = await makeUser(e.db, "judge");
    await createDemoJob(e, { id: me, email: null }, assets);
    await createDemoJob(e, { id: me, email: null }, assets);
    const hist = await e.db.query<{ id: string; status: string }>("select id, status from jobs where trades_id = $1 and address = $2", [me, HISTORY_ADDRESS]);
    expect(hist.rows).toHaveLength(1);
    expect(hist.rows[0]!.status).toBe("COMPLETED");
    const decisions = await store.decisionsForUser(e.db, me);
    expect(decisions).toHaveLength(30);
    const outcomes = new Set(decisions.map((d) => d.outcome));
    expect(outcomes).toEqual(new Set(["ALLOW", "DENY", "REQUIRE_APPROVAL"]));
    // The agent-started release is denied by B6, as a live one would be.
    const agent = decisions.find((d) => d.action.initiator.kind === "agent")!;
    expect(agent.outcome).toBe("DENY");
    expect(agent.decision.rule_hits.map((h) => h.rule_id)).toContain("B6");
  });

  it("judges a sample proof, and two visitors' identical samples aren't 'already used'", async () => {
    const sample = await testPhoto(950);
    for (const name of ["judge-a", "judge-b"]) {
      const me = await makeUser(e.db, name);
      const job = await createDemoJob(e, { id: me, email: null }, assets);
      const { orderId } = await createOrder(e, job.id, me);
      e.paypal.approve(orderId);
      await authorizeJob(e, job.id, orderId, me);
      const l1 = (await store.getLines(e.db, job.id)).find((l) => l.code === "L1")!;
      const r = await submitProof(e, { lineId: l1.id, tradesId: me, photo: sample, deviceId: null, gps: null, sample: true });
      expect(r.verdict).toBe("VERIFIED");
      expect(r.integrity.checks.find((c) => c.name === "reuse")?.result).toBe("pass");
      expect(r.integrity.checks.find((c) => c.name === "geofence")?.result).toBe("skipped");
    }
  });

  it(`caps a visitor at ${DEMO_MODEL_CALLS_PER_HOUR} AI checks an hour`, async () => {
    const me = await makeUser(e.db, "judge");
    const job = await createDemoJob(e, { id: me, email: null }, assets);
    const line = (await store.getLines(e.db, job.id))[0]!;
    const photo = (await store.beforePhotoFor(e.db, line))!;
    await assertDemoBudget(e, me);
    for (let i = 0; i < DEMO_MODEL_CALLS_PER_HOUR; i++) {
      await e.db.query("insert into verdicts (line_id, photo_id, observation, verdict, model) values ($1, $2, '{}', 'VERIFIED', 'scripted')", [line.id, photo.id]);
    }
    await expect(assertDemoBudget(e, me)).rejects.toMatchObject({ code: "demo_limit", status: 429 });
  });
});
