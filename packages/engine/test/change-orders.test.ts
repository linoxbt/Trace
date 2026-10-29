import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Acceptance } from "@trace/core";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import {
  authorizeChangeOrder,
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

  it("the client can decline a change order, and a new one can follow", async () => {
    const co = await proposeChangeOrder(e, h.jobId, h.trades, EXTRA);
    expect((await closeChangeOrder(e, co.id, h.home)).status).toBe("DECLINED");
    await expect(createChangeOrderOrder(e, co.id, h.home)).rejects.toMatchObject({ code: "not_awaiting_approval" });
    expect((await proposeChangeOrder(e, h.jobId, h.trades, EXTRA)).code).toBe("CO2");
  });
});
