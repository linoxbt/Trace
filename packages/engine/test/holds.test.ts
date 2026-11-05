import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Acceptance } from "@trace/core";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import { authorizeChangeOrder, checkPendingHolds, closeChangeOrder, createChangeOrderOrder, handleWebhook, proposeChangeOrder } from "../src/index.ts";
import { testEngine, type TestEngine } from "../src/testing.ts";
import { heldJob } from "./helpers.ts";

const acc = (show: string): Acceptance => ({ criterion: show, must_show: [show], must_not_show: [], framing: "Same angle as the before-photo" });
const EXTRA = [{ title: "Replace the shower head", priceCents: 5000, acceptance: acc("new shower head fitted"), verifiableByPhoto: true }];
const H: Record<string, string> = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT",
  "paypal-transmission-id": "tx-1",
  "paypal-transmission-sig": "sig",
  "paypal-transmission-time": "2026-11-03T10:00:00Z",
};
const header = (n: string) => H[n] ?? null;
let n = 0;

describe.skipIf(!TEST_DATABASE_URL)("engine: holds PayPal is still reviewing", () => {
  let e: TestEngine;
  beforeEach(async () => {
    e = await testEngine();
  });
  afterEach(() => e.db.end());

  const age = (jobId: string) => e.db.query("update authorizations set updated_at = now() - interval '5 minutes' where job_id = $1", [jobId]);

  it("records a pending hold without starting the job, then starts it once PayPal confirms", async () => {
    e.paypal.nextAuthStatus = "PENDING";
    const h = await heldJob(e);
    const auth = (await store.getBaseAuthorization(e.db, h.jobId))!;
    expect(auth).toMatchObject({ status: "PENDING", honor_until: null });
    expect((await store.mustGetJob(e.db, h.jobId)).status).toBe("AWAITING_APPROVAL");
    expect((await store.getEvents(e.db, h.jobId)).map((x) => x.type)).toContain("HOLD_PENDING");

    // Still under review: the worker leaves it.
    await age(h.jobId);
    expect(await checkPendingHolds(e)).toBe(0);

    e.paypal.auths.get(h.authId)!.status = "CREATED";
    await age(h.jobId);
    expect(await checkPendingHolds(e)).toBe(1);
    expect((await store.getBaseAuthorization(e.db, h.jobId))!.status).toBe("CREATED");
    expect((await store.getBaseAuthorization(e.db, h.jobId))!.honor_until).not.toBeNull();
    expect((await store.mustGetJob(e.db, h.jobId)).status).toBe("AUTHORIZED");
    // Once only.
    await age(h.jobId);
    expect(await checkPendingHolds(e)).toBe(0);
  });

  it("closes the job when PayPal denies the hold it was reviewing, from the webhook", async () => {
    e.paypal.nextAuthStatus = "PENDING";
    const h = await heldJob(e);
    e.paypal.auths.get(h.authId)!.status = "DENIED";
    const raw = JSON.stringify({ id: `WH-H${++n}`, event_type: "PAYMENT.AUTHORIZATION.VOIDED", resource: { id: h.authId } });
    expect(await handleWebhook(e, raw, header)).toMatchObject({ result: "processed", jobId: h.jobId });
    expect((await store.getBaseAuthorization(e.db, h.jobId))!.status).toBe("DENIED");
    expect((await store.mustGetJob(e.db, h.jobId)).status).toBe("CLOSED_VOIDED");
  });

  it("adds a change order's lines only once PayPal confirms its pending hold, and can't be withdrawn meanwhile", async () => {
    const h = await heldJob(e);
    const co = await proposeChangeOrder(e, h.jobId, h.trades, EXTRA);
    const { orderId } = await createChangeOrderOrder(e, co.id, h.home);
    e.paypal.approve(orderId);
    e.paypal.nextAuthStatus = "PENDING";
    const after = await authorizeChangeOrder(e, co.id, orderId, h.home);
    expect(after.status).toBe("AWAITING_APPROVAL");
    expect(after.authorization_id).not.toBeNull();
    expect((await store.getLines(e.db, h.jobId)).map((l) => l.code)).toEqual(["L1", "L2", "L3", "L4"]);
    await expect(closeChangeOrder(e, co.id, h.trades)).rejects.toMatchObject({ code: "hold_pending" });
    // Calling again is safe.
    expect((await authorizeChangeOrder(e, co.id, orderId, h.home)).id).toBe(co.id);

    const pp = (await store.authorizationsForJob(e.db, h.jobId)).find((a) => a.kind === "change_order")!;
    e.paypal.auths.get(pp.paypal_auth_id)!.status = "CREATED";
    const raw = JSON.stringify({ id: `WH-H${++n}`, event_type: "PAYMENT.AUTHORIZATION.CREATED", resource: { id: pp.paypal_auth_id } });
    await handleWebhook(e, raw, header);
    expect((await store.getChangeOrder(e.db, co.id))!.status).toBe("AUTHORIZED");
    expect((await store.getLines(e.db, h.jobId)).map((l) => l.code)).toEqual(["L1", "L2", "L3", "L4", "L5"]);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("engine: the same webhook delivered twice at once", () => {
  let e: TestEngine;
  beforeEach(async () => {
    e = await testEngine();
  });
  afterEach(() => e.db.end());

  it("lets one delivery claim it, and a failed run frees it for PayPal's retry", async () => {
    const ev = { id: `WH-C${++n}`, type: "X", payload: {} };
    const [a, b] = await Promise.all([e.db.tx((q) => store.claimWebhookEvent(q, ev)), e.db.tx((q) => store.claimWebhookEvent(q, ev))]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await e.db.tx((q) => store.claimWebhookEvent(q, ev))).toBe(false);
    await store.finishWebhookEvent(e.db, ev.id, "boom");
    expect(await e.db.tx((q) => store.claimWebhookEvent(q, ev))).toBe(true);
    await store.finishWebhookEvent(e.db, ev.id, null);
    expect(await e.db.tx((q) => store.claimWebhookEvent(q, ev))).toBe(false);
  });

  it("lets a retry run once the first delivery's claim has lapsed", async () => {
    const ev = { id: `WH-C${++n}`, type: "X", payload: {} };
    expect(await e.db.tx((q) => store.claimWebhookEvent(q, ev))).toBe(true);
    await e.db.query("update webhook_claims set claimed_until = now() - interval '1 second' where paypal_event_id = $1", [ev.id]);
    expect(await e.db.tx((q) => store.claimWebhookEvent(q, ev))).toBe(true);
  });
});
