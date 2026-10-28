import { describe, expect, it } from "vitest";
import { PayPalClient, PayPalError, PayPalNetworkError, isRetryable, webhookHeaders } from "../src/index.ts";

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | FormData | undefined;
}

function mockFetch(answers: ((s: Seen) => Response)[]) {
  const seen: Seen[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    const s: Seen = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: init?.body as string | FormData | undefined,
    };
    seen.push(s);
    const next = answers.shift();
    if (!next) throw new Error(`unexpected request ${s.method} ${s.url}`);
    return next(s);
  }) as typeof fetch;
  return { f, seen };
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const token = json({ access_token: "A21AA-token", expires_in: 32400 });

describe("PayPalClient", () => {
  it("gets a token once and reuses it", async () => {
    const { f, seen } = mockFetch([token, json({ id: "AUTH1", status: "CREATED" }), json({ id: "AUTH1", status: "CREATED" })]);
    const pp = new PayPalClient({ clientId: "id", clientSecret: "secret", fetch: f });
    await pp.getAuthorization("AUTH1");
    await pp.getAuthorization("AUTH1");
    expect(seen.map((s) => `${s.method} ${new URL(s.url).pathname}`)).toEqual([
      "POST /v1/oauth2/token",
      "GET /v2/payments/authorizations/AUTH1",
      "GET /v2/payments/authorizations/AUTH1",
    ]);
    expect(seen[0]!.headers.Authorization).toBe(`Basic ${Buffer.from("id:secret").toString("base64")}`);
    expect(seen[1]!.headers.Authorization).toBe("Bearer A21AA-token");
    expect(new URL(seen[0]!.url).origin).toBe("https://api-m.sandbox.paypal.com");
  });

  it("creates an AUTHORIZE order with one item per line and no shipping", async () => {
    const { f, seen } = mockFetch([token, json({ id: "ORDER1", status: "CREATED" }, 201)]);
    const pp = new PayPalClient({ clientId: "id", clientSecret: "s", fetch: f });
    await pp.createOrder(
      { currency: "USD", invoiceId: "job-1", customId: "a".repeat(64), description: "Trace job", items: [{ code: "L1", title: "Tap", priceCents: 12000 }, { code: "L2", title: "Grout", priceCents: 11000 }] },
      "order-req-1",
    );
    const req = seen[1]!;
    expect(req.headers["PayPal-Request-Id"]).toBe("order-req-1");
    expect(req.headers.Prefer).toBe("return=representation");
    const body = JSON.parse(req.body as string);
    expect(body.intent).toBe("AUTHORIZE");
    const pu = body.purchase_units[0];
    expect(pu.amount).toEqual({ currency_code: "USD", value: "230.00", breakdown: { item_total: { currency_code: "USD", value: "230.00" } } });
    expect(pu.items).toHaveLength(2);
    expect(pu.items[1]).toMatchObject({ name: "L2 Grout", quantity: "1", unit_amount: { value: "110.00" } });
    expect(pu.invoice_id).toBe("job-1");
    expect(body.payment_source.paypal.experience_context.shipping_preference).toBe("NO_SHIPPING");
  });

  it("sends partial captures with final_capture and the request ID", async () => {
    const { f, seen } = mockFetch([token, json({ id: "CAP1", status: "COMPLETED" }, 201)]);
    const pp = new PayPalClient({ clientId: "id", clientSecret: "s", fetch: f });
    const cap = await pp.captureAuthorization("AUTH1", { amountCents: 31000, currency: "USD", invoiceId: "job-1-r1", finalCapture: false, noteToPayer: "x".repeat(400) }, "capture-abc");
    expect(cap.id).toBe("CAP1");
    const body = JSON.parse(seen[1]!.body as string);
    expect(body).toMatchObject({ amount: { currency_code: "USD", value: "310.00" }, invoice_id: "job-1-r1", final_capture: false });
    expect(body.note_to_payer).toHaveLength(255);
    expect(seen[1]!.headers["PayPal-Request-Id"]).toBe("capture-abc");
  });

  it("maps PayPal errors and says which are retryable", async () => {
    const { f } = mockFetch([
      token,
      json({ name: "UNPROCESSABLE_ENTITY", message: "The requested action could not be performed", debug_id: "d1", details: [{ issue: "MAX_CAPTURE_AMOUNT_EXCEEDED" }] }, 422),
      token,
      json({ name: "INTERNAL_SERVER_ERROR", message: "oops" }, 500),
    ]);
    const pp = new PayPalClient({ clientId: "id", clientSecret: "s", fetch: f });
    const err = await pp.captureAuthorization("A", { amountCents: 1, currency: "USD", invoiceId: "i", finalCapture: true }, "r").catch((e) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect(err.has("MAX_CAPTURE_AMOUNT_EXCEEDED")).toBe(true);
    expect(err.debugId).toBe("d1");
    expect(isRetryable(err)).toBe(false);
    const pp2 = new PayPalClient({ clientId: "id", clientSecret: "s", fetch: f });
    expect(isRetryable(await pp2.getCapture("C").catch((e) => e))).toBe(true);
  });

  it("treats a dropped connection as retryable", async () => {
    const f = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const err = await new PayPalClient({ clientId: "id", clientSecret: "s", fetch: f }).accessToken().catch((e) => e);
    expect(err).toBeInstanceOf(PayPalNetworkError);
    expect(isRetryable(err)).toBe(true);
  });

  it("voids with a 204 and no body", async () => {
    const { f } = mockFetch([token, () => new Response(null, { status: 204 })]);
    await expect(new PayPalClient({ clientId: "id", clientSecret: "s", fetch: f }).voidAuthorization("AUTH1", "void-1")).resolves.toBeUndefined();
  });

  it("returns the webhook event to PayPal byte for byte", async () => {
    const { f, seen } = mockFetch([token, json({ verification_status: "SUCCESS" })]);
    const raw = '{"id":"WH-1","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"amount":{"value":"310.00"},"note":"caf\\u00e9"}}';
    const ok = await new PayPalClient({ clientId: "id", clientSecret: "s", fetch: f }).verifyWebhook(
      { authAlgo: "SHA256withRSA", certUrl: "https://api.sandbox.paypal.com/cert", transmissionId: "t", transmissionSig: "sig", transmissionTime: "2026-11-03T10:00:00Z" },
      raw,
      "WH-ID",
    );
    expect(ok).toBe(true);
    const body = seen[1]!.body as string;
    expect(body.endsWith(`"webhook_event":${raw}}`)).toBe(true);
    expect(JSON.parse(body)).toMatchObject({ webhook_id: "WH-ID", transmission_sig: "sig" });
  });

  it("sends evidence as multipart with an input part and the file", async () => {
    const { f, seen } = mockFetch([token, json({}, 200)]);
    await new PayPalClient({ clientId: "id", clientSecret: "s", fetch: f }).provideEvidence("PP-D-1", {
      evidenceType: "PROOF_OF_FULFILLMENT",
      notes: "n".repeat(3000),
      file: { name: "evidence.pdf", bytes: new Uint8Array([37, 80, 68, 70]), contentType: "application/pdf" },
    });
    const form = seen[1]!.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    const input = JSON.parse(await (form.get("input") as Blob).text());
    expect(input.evidences[0].evidence_type).toBe("PROOF_OF_FULFILLMENT");
    expect(input.evidences[0].notes).toHaveLength(2000);
    expect((form.get("file1") as File).name).toBe("evidence.pdf");
    expect(seen[1]!.headers["Content-Type"]).toBeUndefined();
  });

  it("reads webhook headers and refuses incomplete ones", () => {
    const all: Record<string, string> = {
      "paypal-auth-algo": "a",
      "paypal-cert-url": "b",
      "paypal-transmission-id": "c",
      "paypal-transmission-sig": "d",
      "paypal-transmission-time": "e",
    };
    expect(webhookHeaders((n) => all[n] ?? null)).toMatchObject({ transmissionSig: "d" });
    delete all["paypal-transmission-sig"];
    expect(webhookHeaders((n) => all[n] ?? null)).toBeNull();
  });
});
