// The negative cases spec section 13 runs against the sandbox, checked against
// the fake so the engine's tests rest on the same rules.

import { describe, expect, it } from "vitest";
import { authorizationOf, PayPalError } from "../src/index.ts";
import { FakePayPal } from "../src/fake.ts";

async function held(pp: FakePayPal, cents = 10000) {
  const order = await pp.createOrder({ currency: "USD", invoiceId: "job", customId: "h", description: "d", items: [{ code: "L1", title: "t", priceCents: cents }] }, "o1");
  pp.approve(order.id);
  return authorizationOf(await pp.authorizeOrder(order.id, "a1"));
}

const cap = (cents: number, invoiceId: string, finalCapture: boolean) => ({ amountCents: cents, currency: "USD", invoiceId, finalCapture });

describe("FakePayPal", () => {
  it("authorizes $100, captures $60 then $40 final (the day-1 spike)", async () => {
    const pp = new FakePayPal();
    const auth = await held(pp);
    expect((await pp.captureAuthorization(auth.id, cap(6000, "r1", false), "c1")).status).toBe("COMPLETED");
    expect((await pp.getAuthorization(auth.id)).status).toBe("PARTIALLY_CAPTURED");
    await pp.captureAuthorization(auth.id, cap(4000, "r2", true), "c2");
    expect((await pp.getAuthorization(auth.id)).status).toBe("CAPTURED");
  });

  it("captures $60 and voids the rest", async () => {
    const pp = new FakePayPal();
    const auth = await held(pp);
    await pp.captureAuthorization(auth.id, cap(6000, "r1", false), "c1");
    await pp.voidAuthorization(auth.id, "v1");
    expect((await pp.getAuthorization(auth.id)).status).toBe("VOIDED");
  });

  it("refuses a capture over the authorized amount", async () => {
    const pp = new FakePayPal();
    const auth = await held(pp);
    const err = await pp.captureAuthorization(auth.id, cap(10001, "r1", false), "c1").catch((e) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect(err.has("MAX_CAPTURE_AMOUNT_EXCEEDED")).toBe(true);
  });

  it("refuses a capture after void and a void after full capture", async () => {
    const pp = new FakePayPal();
    const a = await held(pp);
    await pp.voidAuthorization(a.id, "v1");
    expect((await pp.captureAuthorization(a.id, cap(100, "r1", false), "c1").catch((e) => e)).has("AUTHORIZATION_VOIDED")).toBe(true);
    const pp2 = new FakePayPal();
    const b = await held(pp2);
    await pp2.captureAuthorization(b.id, cap(10000, "r1", true), "c1");
    expect((await pp2.voidAuthorization(b.id, "v1").catch((e) => e)).has("PREVIOUSLY_CAPTURED")).toBe(true);
  });

  it("answers a repeated request ID with the original capture", async () => {
    const pp = new FakePayPal();
    const a = await held(pp);
    const one = await pp.captureAuthorization(a.id, cap(6000, "r1", false), "same");
    const two = await pp.captureAuthorization(a.id, cap(6000, "r1", false), "same");
    expect(two.id).toBe(one.id);
    expect(pp.capturedOn(a.id)).toBe(6000);
  });

  it("refuses to authorize an order the buyer hasn't approved", async () => {
    const pp = new FakePayPal();
    const order = await pp.createOrder({ currency: "USD", invoiceId: "j", customId: "h", description: "d", items: [{ code: "L1", title: "t", priceCents: 100 }] }, "o");
    expect((await pp.authorizeOrder(order.id, "a").catch((e) => e)).has("ORDER_NOT_APPROVED")).toBe(true);
  });

  it("reauthorizes once, and only when allowed after a partial capture", async () => {
    const pp = new FakePayPal();
    const a = await held(pp);
    await pp.captureAuthorization(a.id, cap(6000, "r1", false), "c1");
    pp.allowReauthorizeAfterPartialCapture = false;
    expect((await pp.reauthorize(a.id, null, "re1").catch((e) => e)).has("REAUTHORIZATION_NOT_ALLOWED_AFTER_CAPTURE")).toBe(true);
    pp.allowReauthorizeAfterPartialCapture = true;
    const b = await pp.reauthorize(a.id, { cents: 4000, currency: "USD" }, "re2");
    expect(b.id).not.toBe(a.id);
    expect((await pp.reauthorize(b.id, null, "re3").catch((e) => e)).has("MAX_NUMBER_OF_REAUTHORIZATIONS_EXCEEDED")).toBe(true);
    await pp.captureAuthorization(b.id, cap(4000, "r2", true), "c2");
    expect((await pp.getAuthorization(b.id)).status).toBe("CAPTURED");
  });
});
