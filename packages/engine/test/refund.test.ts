import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import { answerApproval, decideLine, guardedRefund, handleWebhook, release } from "../src/index.ts";
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

  const H: Record<string, string> = {
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT",
    "paypal-transmission-id": "tx-r",
    "paypal-transmission-sig": "sig",
    "paypal-transmission-time": "2026-11-03T10:00:00Z",
  };
  let n = 0;
  const webhook = (event_type: string, resource: Record<string, unknown>) => handleWebhook(e, JSON.stringify({ id: `WH-R-${++n}`, event_type, resource }), (k) => H[k] ?? null);

  /** L1 ($120) captured, then a refund of `cents` approved by both sides. */
  async function paidL1() {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    const r = await release(e, h.jobId);
    if (r.kind !== "captured") throw new Error(r.kind);
    const refund = async (cents?: number) => {
      const asked = await guardedRefund(e, h.jobId, { kind: "tradesperson", userId: h.trades }, r.captureId, cents ? { amountCents: cents } : {});
      if (asked.outcome !== "REQUIRE_APPROVAL") return asked;
      await answerApproval(e, asked.approvalId, h.trades, true);
      return answerApproval(e, asked.approvalId, h.home, true);
    };
    return { h, captureId: r.captureId, refund };
  }

  it("refunds in parts up to the captured amount, never past it", async () => {
    const { h, captureId, refund } = await paidL1();
    await refund(5000);
    await refund(5000);
    expect(await store.getCapture(e.db, captureId)).toMatchObject({ status: "PARTIALLY_REFUNDED", refunded_cents: 10000 });
    await expect(guardedRefund(e, h.jobId, { kind: "homeowner", userId: h.home }, captureId, { amountCents: 2001 })).rejects.toMatchObject({ code: "bad_amount" });
    await refund();
    expect(await store.getCapture(e.db, captureId)).toMatchObject({ status: "REFUNDED", refunded_cents: 12000 });
    expect(e.paypal.calls.filter((c) => c.op === "refundCapture").map((c) => (c.args[1] as { cents: number }).cents)).toEqual([5000, 5000, 2000]);
  });

  it("PayPal's refund webhook counts each refund once, and a partial one stays partial", async () => {
    const { captureId, refund } = await paidL1();
    await refund(3000);
    const cap = (await store.getCapture(e.db, captureId))!;
    const up = [{ rel: "up", href: `https://api.sandbox.paypal.com/v2/payments/captures/${cap.paypal_capture_id}` }];
    // The webhook for the refund Trace already recorded doesn't count it again.
    await webhook("PAYMENT.CAPTURE.REFUNDED", { id: cap.refund_ids[0], amount: { value: "30.00", currency_code: "USD" }, links: up });
    expect(await store.getCapture(e.db, captureId)).toMatchObject({ status: "PARTIALLY_REFUNDED", refunded_cents: 3000 });
    // A refund made at PayPal directly is counted, by its amount.
    await webhook("PAYMENT.CAPTURE.REFUNDED", { id: "REFUND-AT-PAYPAL", amount: { value: "10.00", currency_code: "USD" }, links: up });
    expect(await store.getCapture(e.db, captureId)).toMatchObject({ status: "PARTIALLY_REFUNDED", refunded_cents: 4000 });
  });

  it("a late capture webhook can't undo a refund or allow a second one", async () => {
    const { h, captureId, refund } = await paidL1();
    await refund();
    const cap = (await store.getCapture(e.db, captureId))!;
    await webhook("PAYMENT.CAPTURE.COMPLETED", { id: cap.paypal_capture_id, status: "COMPLETED", invoice_id: cap.invoice_id, amount: { value: "120.00", currency_code: "USD" } });
    expect(await store.getCapture(e.db, captureId)).toMatchObject({ status: "REFUNDED", refunded_cents: 12000 });
    await expect(guardedRefund(e, h.jobId, { kind: "tradesperson", userId: h.trades }, captureId)).rejects.toMatchObject({ code: "not_refundable" });
  });
});
