import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import {
  authorizeJob,
  createDemoJob,
  createOrder,
  demoJobFor,
  GUEST_HOURLY_LIMIT,
  HISTORY_ADDRESS,
  HOURLY_LIMITS,
  spendBudget,
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

  it(`caps a visitor at ${HOURLY_LIMITS.demo_proof} demo AI checks an hour, reserved before the call`, async () => {
    const me = await makeUser(e.db, "judge");
    const job = await createDemoJob(e, { id: me, email: null }, assets);
    const { orderId } = await createOrder(e, job.id, me);
    e.paypal.approve(orderId);
    await authorizeJob(e, job.id, orderId, me);
    const l1 = (await store.getLines(e.db, job.id))[0]!;
    // Requests sent together can't all slip under the limit: each reserves first.
    const tries = await Promise.allSettled(Array.from({ length: HOURLY_LIMITS.demo_proof + 5 }, () => spendBudget(e, me, "demo_proof", { guest: true })));
    expect(tries.filter((t) => t.status === "fulfilled")).toHaveLength(HOURLY_LIMITS.demo_proof);
    const calls = e.verifier.calls.length;
    await expect(submitProof(e, { lineId: l1.id, tradesId: me, photo: await testPhoto(), deviceId: null, gps: null, sample: true })).rejects.toMatchObject({ code: "rate_limited", status: 429 });
    expect(e.verifier.calls.length).toBe(calls);
  });

  it("all guests together share one hourly allowance", async () => {
    await e.db.query("insert into model_usage (user_id, kind, guest) select gen_random_uuid(), 'demo_proof', true from generate_series(1, $1)", [GUEST_HOURLY_LIMIT]);
    const fresh = await makeUser(e.db, "new-guest");
    await expect(spendBudget(e, fresh, "demo_proof", { guest: true })).rejects.toMatchObject({ code: "rate_limited" });
    // A signed-in user's own work isn't held back by the demo's traffic.
    await expect(spendBudget(e, fresh, "proof")).resolves.toBeUndefined();
  });

  it("opening the demo again returns the visitor's open demo job instead of making another", async () => {
    const me = await makeUser(e.db, "judge2");
    let loads = 0;
    const load = async () => {
      loads += 1;
      return assets;
    };
    const first = await demoJobFor(e, { id: me, email: null }, load);
    const again = await demoJobFor(e, { id: me, email: null }, load);
    expect(again.id).toBe(first.id);
    expect(loads).toBe(1);
    const open = await e.db.query<{ n: number }>("select count(*)::int as n from jobs where demo and trades_id = $1 and address <> $2", [me, HISTORY_ADDRESS]);
    expect(open.rows[0]!.n).toBe(1);
  });
});
