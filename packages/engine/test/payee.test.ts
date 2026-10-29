import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import {
  addBeforePhoto,
  claimJob,
  createJob,
  createOrder,
  decideLine,
  disconnectPayee,
  handleWebhook,
  payeeStatus,
  refreshPayee,
  release,
  saveScope,
  sendScope,
  startPayeeConnect,
} from "../src/index.ts";
import { connectPayee, makeUser, testEngine, testPhoto, type TestEngine } from "../src/testing.ts";
import { ANCHOR, BATHROOM, DEVICE, heldJob, prove } from "./helpers.ts";

const H: Record<string, string> = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT",
  "paypal-transmission-id": "tx-1",
  "paypal-transmission-sig": "sig",
  "paypal-transmission-time": "2026-11-03T10:00:00Z",
};
let n = 0;
const event = (event_type: string, resource: Record<string, unknown>) => JSON.stringify({ id: `WH-P-${++n}`, event_type, resource });

describe.skipIf(!TEST_DATABASE_URL)("engine: paying the tradesperson directly", () => {
  let e: TestEngine;
  beforeEach(async () => {
    e = await testEngine();
  });
  afterEach(() => e.db.end());

  /** A drafted job, scope saved, not yet sent. */
  async function draft(opts: { demo?: boolean } = {}) {
    const trades = await makeUser(e.db, "trades");
    const home = opts.demo ? trades : await makeUser(e.db, "home");
    const email = (await e.db.query<{ email: string }>("select email from auth.users where id = $1", [home])).rows[0]!.email;
    const job = await createJob(e, { tradesId: trades, homeownerEmail: email, address: "12 Admiralty Way", deviceId: DEVICE, demo: !!opts.demo });
    await addBeforePhoto(e, { jobId: job.id, tradesId: trades, photo: await testPhoto(), gps: ANCHOR, deviceId: DEVICE });
    await saveScope(e, job.id, trades, BATHROOM);
    return { job, trades, home, email };
  }

  it("won't send a scope until the tradesperson has a PayPal account to be paid into", async () => {
    const d = await draft();
    await expect(sendScope(e, d.job.id, d.trades)).rejects.toMatchObject({ code: "payee_not_ready" });
    await connectPayee(e, d.trades);
    await expect(sendScope(e, d.job.id, d.trades)).resolves.toMatchObject({ status: "AWAITING_APPROVAL" });
  });

  it("lets a sandbox demo job through without a linked account", async () => {
    const d = await draft({ demo: true });
    await expect(sendScope(e, d.job.id, d.trades)).resolves.toMatchObject({ status: "AWAITING_APPROVAL" });
  });

  it("links an account only once PayPal says it can take payments", async () => {
    const trades = await makeUser(e.db, "trades");
    const { url } = await startPayeeConnect(e, trades, "https://trace.test/api/paypal/return");
    expect(url).toContain("bizsignup");
    expect(e.paypal.referrals.has(trades)).toBe(true);
    expect(await refreshPayee(e, trades)).toMatchObject({ state: "none", merchantId: null });

    const merchant = e.paypal.onboard(trades, { emailConfirmed: false });
    expect(await refreshPayee(e, trades)).toMatchObject({ state: "pending", merchantId: merchant, emailConfirmed: false });

    e.paypal.onboard(trades, { emailConfirmed: true });
    expect(await refreshPayee(e, trades)).toMatchObject({ state: "ready", merchantId: merchant });

    expect(await disconnectPayee(e, trades)).toMatchObject({ state: "none" });
  });

  it("names the tradesperson as payee, so released money lands in their PayPal", async () => {
    const h = await heldJob(e);
    const merchant = (await payeeStatus(e, h.trades)).merchantId!;
    const job = await store.mustGetJob(e.db, h.jobId);
    expect(job.payee_merchant_id).toBe(merchant);
    expect([...e.paypal.orders.values()][0]!.input.payeeMerchantId).toBe(merchant);

    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    const r = await release(e, h.jobId);
    if (r.kind !== "captured") throw new Error(r.kind);
    const cap = await store.getCapture(e.db, r.captureId);
    expect(e.paypal.payeeOfCapture(cap!.paypal_capture_id!)).toBe(merchant);
  });

  it("refuses the homeowner's order if the tradesperson unlinked PayPal after sending", async () => {
    const d = await draft();
    await connectPayee(e, d.trades);
    await sendScope(e, d.job.id, d.trades);
    await claimJob(e, d.job.id, { id: d.home, email: d.email });
    await disconnectPayee(e, d.trades);
    await expect(createOrder(e, d.job.id, d.home)).rejects.toMatchObject({ code: "payee_not_ready" });
    expect(e.paypal.orders.size).toBe(0);
  });

  it("follows PayPal's merchant webhooks: consent withdrawn unlinks, sign-up completed links", async () => {
    const trades = await makeUser(e.db, "trades");
    const merchant = await connectPayee(e, trades);
    const header = (k: string) => H[k] ?? null;

    await handleWebhook(e, event("MERCHANT.PARTNER-CONSENT.REVOKED", { merchant_id: merchant, tracking_id: trades }), header);
    expect(await payeeStatus(e, trades)).toMatchObject({ state: "none" });

    await handleWebhook(e, event("MERCHANT.ONBOARDING.COMPLETED", { merchant_id: merchant, tracking_id: trades }), header);
    expect(await payeeStatus(e, trades)).toMatchObject({ state: "ready", merchantId: merchant });

    // Sign-up finished at PayPal, but the person never came back to Trace.
    const away = await makeUser(e.db, "trades");
    const awayMerchant = e.paypal.onboard(away);
    await handleWebhook(e, event("MERCHANT.ONBOARDING.COMPLETED", { merchant_id: awayMerchant }), header);
    expect(await payeeStatus(e, away)).toMatchObject({ state: "ready", merchantId: awayMerchant });

    const stranger = await handleWebhook(e, event("MERCHANT.ONBOARDING.COMPLETED", { merchant_id: "UNKNOWN" }), header);
    expect(stranger.result).toBe("ignored");
  });
});
