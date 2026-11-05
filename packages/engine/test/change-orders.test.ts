import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Acceptance } from "@trace/core";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import {
  authorizeChangeOrder,
  handleWebhook,
  closeChangeOrder,
  confirmClose,
  createChangeOrderOrder,
  decideLine,
  proposeChangeOrder,
  release,
} from "../src/index.ts";
import { testEngine, type TestEngine } from "../src/testing.ts";
import { heldJob, lineStatus, prove, type Held } from "./helpers.ts";

const acc = (show: string): Acceptance => ({ criterion: show, must_show: [show], must_not_show: [], framing: "Same angle as the before-photo" });
const EXTRA = [{ title: "Replace the shower head", priceCents: 5000, acceptance: acc("new shower head fitted"), verifiableByPhoto: true }];

describe.skipIf(!TEST_DATABASE_URL)("engine: change orders", () => {
  let e: TestEngine;
  let h: Held;
  beforeEach(async () => {
    e = await testEngine();
    h = await heldJob(e);
  });
  afterEach(() => e.db.end());

  async function heldChangeOrder() {
    const co = await proposeChangeOrder(e, h.jobId, h.trades, EXTRA);
    const { orderId } = await createChangeOrderOrder(e, co.id, h.home);
    e.paypal.approve(orderId);
    return authorizeChangeOrder(e, co.id, orderId, h.home);
  }

  it("adds lines through their own PayPal order and hold, paid to the same tradesperson", async () => {
    const co = await proposeChangeOrder(e, h.jobId, h.trades, EXTRA);
    expect(co).toMatchObject({ code: "CO1", status: "AWAITING_APPROVAL", total_cents: 5000 });
    expect(co.lines.map((l) => l.code)).toEqual(["L5"]);
    // Not part of the job until the client holds the money for it.
    expect((await store.getLines(e.db, h.jobId)).map((l) => l.code)).toEqual(["L1", "L2", "L3", "L4"]);
    await expect(proposeChangeOrder(e, h.jobId, h.trades, EXTRA)).rejects.toMatchObject({ code: "change_order_pending" });

    const { orderId } = await createChangeOrderOrder(e, co.id, h.home);
    const order = e.paypal.orders.get(orderId)!;
    expect(order.input).toMatchObject({ invoiceId: `${h.jobId}-CO1`, payeeMerchantId: (await store.mustGetJob(e.db, h.jobId)).payee_merchant_id });
    e.paypal.approve(orderId);
    const held = await authorizeChangeOrder(e, co.id, orderId, h.home);
    expect(held.status).toBe("AUTHORIZED");
    const auths = await store.authorizationsForJob(e.db, h.jobId);
    expect(auths.map((a) => [a.kind, a.amount_cents])).toEqual([["base", 42000], ["change_order", 5000]]);
    const l5 = (await store.getLines(e.db, h.jobId)).find((l) => l.code === "L5")!;
    expect(l5).toMatchObject({ change_order_id: co.id, status: "PENDING" });
  });

  it("captures each hold on its own: base lines from the base hold, added lines from theirs", async () => {
    await heldChangeOrder();
    const l5 = (await store.getLines(e.db, h.jobId)).find((l) => l.code === "L5")!;
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    await prove(e, { ...h, lines: { ...h.lines, L5: l5 } }, "L5");
    await decideLine(e, l5.id, h.home, { approve: true });
    const r = await release(e, h.jobId);
    expect(r).toMatchObject({ kind: "captured", amountCents: 12000 + 5000 });
    const caps = await e.db.query<{ invoice_id: string; amount_cents: number; kind: string }>(
      "select c.invoice_id, c.amount_cents, a.kind from captures c join authorizations a on a.id = c.authorization_id order by c.created_at",
    );
    expect(caps.rows).toEqual([
      { invoice_id: `${h.jobId}-r1`, amount_cents: 12000, kind: "base" },
      { invoice_id: `${h.jobId}-CO1-r1`, amount_cents: 5000, kind: "change_order" },
    ]);
    // The change order's only line is paid, so its capture was final.
    expect(await lineStatus(e, h)).toMatchObject({ L1: "CAPTURED", L5: "CAPTURED" });
  });

  it("closing drops what's left on each hold and voids it", async () => {
    await heldChangeOrder();
    const ids = (await store.getLines(e.db, h.jobId)).map((l) => l.id);
    await confirmClose(e, h.jobId, h.trades, ids);
    const out = await confirmClose(e, h.jobId, h.home, ids);
    expect(out).toMatchObject({ kind: "closed", voided: true });
    const statuses = (await store.authorizationsForJob(e.db, h.jobId)).map((a) => a.status);
    expect(statuses).toEqual(["VOIDED", "VOIDED"]);
    expect((await store.mustGetJob(e.db, h.jobId)).status).toBe("CLOSED_VOIDED");
  });

  it("closing pays a change order's approved line even when the scope's own hold is voided", async () => {
    const co = await heldChangeOrder();
    // L1 paid from the scope's hold; L5, the change order's line, approved but not yet released.
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    await release(e, h.jobId);
    const l5 = (await store.getLines(e.db, h.jobId)).find((l) => l.code === "L5")!;
    await prove(e, { ...h, lines: { ...h.lines, L5: l5 } }, "L5");
    await decideLine(e, l5.id, h.home, { approve: true });
    // Drop the rest of the scope: its hold has nothing left to capture and is voided.
    const drop = ["L2", "L3", "L4"].map((c) => h.lines[c]!.id);
    await confirmClose(e, h.jobId, h.trades, drop);
    await confirmClose(e, h.jobId, h.home, drop);
    const holds = await store.authorizationsForJob(e.db, h.jobId);
    expect(holds.map((a) => [a.kind, a.status])).toEqual([["base", "VOIDED"], ["change_order", "CAPTURED"]]);
    expect((await lineStatus(e, h)).L5).toBe("CAPTURED");
    expect((await store.mustGetJob(e.db, h.jobId)).status).toBe("COMPLETED");
    expect(co.status).toBe("AUTHORIZED");
  });

  it("a void at PayPal of one hold leaves the job open while another hold is live", async () => {
    await heldChangeOrder();
    const coHold = (await store.authorizationsForJob(e.db, h.jobId)).find((a) => a.kind === "change_order")!;
    const raw = JSON.stringify({ id: "WH-co-void", event_type: "PAYMENT.AUTHORIZATION.VOIDED", resource: { id: coHold.paypal_auth_id } });
    const headers: Record<string, string> = {
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT",
      "paypal-transmission-id": "tx-co",
      "paypal-transmission-sig": "sig",
      "paypal-transmission-time": "2026-11-03T10:00:00Z",
    };
    await handleWebhook(e, raw, (n) => headers[n] ?? null);
    expect((await store.authorizationsForJob(e.db, h.jobId)).map((a) => a.status)).toEqual(["CREATED", "VOIDED"]);
    expect((await store.mustGetJob(e.db, h.jobId)).status).toBe("AUTHORIZED");
  });

  it("nothing can be added once a close is agreed, and a hold approved too late is released", async () => {
    const co = await proposeChangeOrder(e, h.jobId, h.trades, EXTRA);
    const { orderId } = await createChangeOrderOrder(e, co.id, h.home);
    e.paypal.approve(orderId);
    const all = Object.values(h.lines).map((l) => l.id);
    await confirmClose(e, h.jobId, h.trades, all);
    await confirmClose(e, h.jobId, h.home, all);
    expect((await store.getChangeOrder(e.db, co.id))!.status).toBe("CANCELLED");
    await expect(authorizeChangeOrder(e, co.id, orderId, h.home)).rejects.toMatchObject({ code: "not_awaiting_approval" });
    await expect(proposeChangeOrder(e, h.jobId, h.trades, EXTRA)).rejects.toMatchObject({ code: "not_held" });
    expect((await store.authorizationsForJob(e.db, h.jobId)).map((a) => a.kind)).toEqual(["base"]);
  });

  it("a change order isn't authorized onto a job that closed while PayPal was approving it, and its hold is released", async () => {
    const co = await proposeChangeOrder(e, h.jobId, h.trades, EXTRA);
    const { orderId } = await createChangeOrderOrder(e, co.id, h.home);
    e.paypal.approve(orderId);
    // The job closes while PayPal is authorizing the change order's hold.
    const authorize = e.paypal.authorizeOrder.bind(e.paypal);
    e.paypal.authorizeOrder = async (id, rid) => {
      const order = await authorize(id, rid);
      await e.db.query("update jobs set status = 'CLOSED_VOIDED' where id = $1", [h.jobId]);
      return order;
    };
    await expect(authorizeChangeOrder(e, co.id, orderId, h.home)).rejects.toMatchObject({ code: "not_held" });
    expect((await store.authorizationsForJob(e.db, h.jobId)).map((a) => a.kind)).toEqual(["base"]);
    const late = [...e.paypal.auths.values()].find((a) => a.orderId === orderId);
    expect(late?.status).toBe("VOIDED");
  });

  it("a demo job's change orders are photo lines only", async () => {
    await e.db.query("update jobs set demo = true where id = $1", [h.jobId]);
    const link = [{ ...EXTRA[0]!, proofType: "deliverable", proofSpec: { kind: "url" } }];
    await expect(proposeChangeOrder(e, h.jobId, h.trades, link)).rejects.toMatchObject({ code: "demo_photo_only" });
    expect((await proposeChangeOrder(e, h.jobId, h.trades, EXTRA)).code).toBe("CO1");
  });

  it("the client can decline a change order, and a new one can follow", async () => {
    const co = await proposeChangeOrder(e, h.jobId, h.trades, EXTRA);
    expect((await closeChangeOrder(e, co.id, h.home)).status).toBe("DECLINED");
    await expect(createChangeOrderOrder(e, co.id, h.home)).rejects.toMatchObject({ code: "not_awaiting_approval" });
    expect((await proposeChangeOrder(e, h.jobId, h.trades, EXTRA)).code).toBe("CO2");
  });
});
