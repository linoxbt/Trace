import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Decision, MoneyAction } from "@trace/core";
import * as store from "../src/index.ts";
import { freshDb, makeUser, TEST_DATABASE_URL } from "../src/testing.ts";

describe.skipIf(!TEST_DATABASE_URL)("guard ledger", () => {
  let db: store.Db;
  let jobId: string;
  beforeAll(async () => {
    db = await freshDb();
    const trades = await makeUser(db, "t");
    const job = await store.insertJob(db, { tradesId: trades, homeownerEmail: "home@example.test", address: "1 A St" });
    jobId = job.id;
  });
  afterAll(() => db.end());

  const action = (): MoneyAction => ({
    request_id: "capture-x",
    type: "CAPTURE",
    job_id: jobId,
    line_ids: [],
    amount_cents: 100,
    initiator: { kind: "homeowner" },
    provenance: { verdict_ids: [], approval_event_ids: [], inputs: [] },
  });
  const decision = (): Decision => ({
    request_id: "capture-x",
    outcome: "ALLOW",
    rule_hits: [],
    facts: {} as Decision["facts"],
    injection: { flagged: false, proof_ids: [] },
    reasons_plain: ["ok"],
    decided_at: new Date().toISOString(),
  });

  it("records a decision and lets its result be filled in exactly once", async () => {
    const row = await store.insertDecision(db, action(), decision());
    await store.markDecisionExecuted(db, row.id, { capture: "C1" });
    const [again] = await store.decisionsForRequest(db, "capture-x");
    expect(again).toMatchObject({ executed: true, paypal_result: { capture: "C1" } });
    await expect(db.query("update guard_decisions set paypal_result = '{}' where id = $1", [row.id])).rejects.toThrow(/append-only/);
  });

  it("refuses edits and deletes", async () => {
    const row = await store.insertDecision(db, action(), decision());
    await expect(db.query("update guard_decisions set outcome = 'DENY' where id = $1", [row.id])).rejects.toThrow(/append-only/);
    await expect(db.query("delete from guard_decisions where id = $1", [row.id])).rejects.toThrow(/append-only/);
  });
});
