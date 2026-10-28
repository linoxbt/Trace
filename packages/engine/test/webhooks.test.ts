import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import { decideLine, handleWebhook, release, WebhookRejected } from "../src/index.ts";
import { testEngine, type TestEngine } from "../src/testing.ts";
import { heldJob, lineStatus, prove } from "./helpers.ts";

const H: Record<string, string> = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT",
  "paypal-transmission-id": "tx-1",
  "paypal-transmission-sig": "sig",
  "paypal-transmission-time": "2026-11-03T10:00:00Z",
};
const header = (n: string) => H[n] ?? null;
let n = 0;
const event = (event_type: string, resource: Record<string, unknown>) => JSON.stringify({ id: `WH-${++n}`, event_type, resource });

describe.skipIf(!TEST_DATABASE_URL)("engine: webhooks", () => {
  let e: TestEngine;
  beforeEach(async () => {
    e = await testEngine();
  });
  afterEach(() => e.db.end());

  async function oneCaptured() {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    return h;
  }

  it("rejects unsigned or unverified webhooks", async () => {
    await expect(handleWebhook(e, event("X", {}), () => null)).rejects.toBeInstanceOf(WebhookRejected);
    e.paypal.webhookVerdict = false;
    await expect(handleWebhook(e, event("X", {}), header)).rejects.toThrow(/did not verify/);
    expect((await e.db.query("select count(*)::int as n from webhook_events")).rows[0]!.n).toBe(0);
  });

  it("verifies against the configured webhook ID and the raw body", async () => {
    const raw = event("SOMETHING.ELSE", { id: "x" });
    expect(await handleWebhook(e, raw, header)).toMatchObject({ result: "ignored" });
    const call = e.paypal.calls.find((c) => c.op === "verifyWebhook")!;
    expect(call.args[1]).toBe(raw);
    expect(call.args[2]).toBe("WH-TEST");
  });

  it("settles a capture whose response was lost when PAYMENT.CAPTURE.COMPLETED arrives, once", async () => {
    const h = await oneCaptured();
    e.paypal.loseNextResponse("captureAuthorization");
    expect((await release(e, h.jobId)).kind).toBe("sending");
    const pp = [...e.paypal.captures.values()][0]!;
    const raw = event("PAYMENT.CAPTURE.COMPLETED", { id: pp.id, status: "COMPLETED", invoice_id: pp.invoice_id, amount: pp.amount });
    expect(await handleWebhook(e, raw, header)).toMatchObject({ result: "processed", jobId: h.jobId });
    expect(await lineStatus(e, h)).toMatchObject({ L1: "CAPTURED" });
    expect(await handleWebhook(e, raw, header)).toMatchObject({ result: "duplicate" });
    const captured = (await store.getEvents(e.db, h.jobId)).filter((x) => x.type === "CAPTURED");
    expect(captured).toHaveLength(1);
  });

  it("puts lines back when a pending capture is denied", async () => {
    const h = await oneCaptured();
    e.paypal.nextCaptureStatus = "PENDING";
    expect(await release(e, h.jobId)).toMatchObject({ kind: "captured", status: "PENDING" });
    expect(await lineStatus(e, h)).toMatchObject({ L1: "CAPTURED" });
    const pp = [...e.paypal.captures.values()][0]!;
    await handleWebhook(e, event("PAYMENT.CAPTURE.DENIED", { id: pp.id, status: "DECLINED", invoice_id: pp.invoice_id }), header);
    expect(await store.getLine(e.db, h.lines.L1!.id)).toMatchObject({ status: "APPROVED", capture_id: null });
    const denied = (await store.getEvents(e.db, h.jobId)).find((x) => x.type === "CAPTURE_DENIED");
    expect(denied?.data).toMatchObject({ alert: "both" });
  });

  it("opens a dispute on the job from CUSTOMER.DISPUTE.CREATED and follows its updates", async () => {
    const h = await oneCaptured();
    await release(e, h.jobId);
    const cap = [...e.paypal.captures.values()][0]!;
    const d = e.paypal.openDispute(cap.id);
    const created = event("CUSTOMER.DISPUTE.CREATED", { dispute_id: d.dispute_id, reason: d.reason, status: "OPEN", disputed_transactions: d.disputed_transactions });
    expect(await handleWebhook(e, created, header)).toMatchObject({ result: "processed", jobId: h.jobId });
    expect((await store.mustGetJob(e.db, h.jobId)).disputed).toBe(true);
    await handleWebhook(e, event("CUSTOMER.DISPUTE.UPDATED", { dispute_id: d.dispute_id, status: "WAITING_FOR_SELLER_RESPONSE", disputed_transactions: d.disputed_transactions }), header);
    const { rows } = await e.db.query("select status, reason from disputes where paypal_dispute_id = $1", [d.dispute_id]);
    expect(rows[0]).toEqual({ status: "WAITING_FOR_SELLER_RESPONSE", reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED" });
    const types = (await store.getEvents(e.db, h.jobId)).map((x) => x.type);
    expect(types).toEqual(expect.arrayContaining(["DISPUTE_OPENED", "DISPUTE_UPDATED"]));
  });

  it("closes an open job when PayPal voids its hold", async () => {
    const h = await heldJob(e);
    await handleWebhook(e, event("PAYMENT.AUTHORIZATION.VOIDED", { id: h.authId, status: "VOIDED" }), header);
    expect((await store.mustGetJob(e.db, h.jobId)).status).toBe("CLOSED_VOIDED");
  });

  it("leaves a failed event unprocessed so PayPal's retry runs it", async () => {
    const h = await oneCaptured();
    await release(e, h.jobId);
    const cap = [...e.paypal.captures.values()][0]!;
    const raw = event("PAYMENT.CAPTURE.COMPLETED", { id: cap.id, status: "COMPLETED" });
    const orig = e.db.tx.bind(e.db);
    let calls = 0;
    e.db.tx = (async (fn: never) => {
      calls += 1;
      if (calls === 2) throw new Error("database hiccup");
      return orig(fn);
    }) as typeof e.db.tx;
    await expect(handleWebhook(e, raw, header)).rejects.toThrow("database hiccup");
    e.db.tx = orig;
    expect(await handleWebhook(e, raw, header)).toMatchObject({ result: "processed" });
  });
});
