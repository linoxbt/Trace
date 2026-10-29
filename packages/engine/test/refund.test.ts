import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import { answerApproval, decideLine, guardedRefund, release } from "../src/index.ts";
import { testEngine, type TestEngine } from "../src/testing.ts";
import { heldJob, prove } from "./helpers.ts";

describe.skipIf(!TEST_DATABASE_URL)("engine: refunds from the job page", () => {
  let e: TestEngine;
  beforeEach(async () => {
    e = await testEngine();
  });
  afterEach(() => e.db.end());

  it("asks both sides, then refunds from the payee's account once both approve", async () => {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    const r = await release(e, h.jobId);
    if (r.kind !== "captured") throw new Error(r.kind);
    const asked = await guardedRefund(e, h.jobId, { kind: "tradesperson", userId: h.trades }, r.captureId, { amountCents: 5000 });
    expect(asked).toMatchObject({ outcome: "REQUIRE_APPROVAL", refunded: false });
    if (asked.outcome !== "REQUIRE_APPROVAL") throw new Error("expected an approval");
    expect(e.paypal.calls.filter((c) => c.op === "refundCapture")).toHaveLength(0);

    expect(await answerApproval(e, asked.approvalId, h.trades, true)).toMatchObject({ kind: "waiting" });
    await answerApproval(e, asked.approvalId, h.home, true);
    const call = e.paypal.calls.find((c) => c.op === "refundCapture")!;
    expect(call.args[1]).toEqual({ cents: 5000, currency: "USD" });
    expect(call.args[3]).toBe((await store.mustGetJob(e.db, h.jobId)).payee_merchant_id);
    expect((await store.getCapture(e.db, r.captureId))!.status).toBe("PARTIALLY_REFUNDED");
  });
});
