import { describe, expect, it } from "vitest";
import { PayPalClient, PayPalError, PayPalNetworkError, PayPalSdkClient, type PayPalApi } from "../src/index.ts";

// The SDK-backed client must put the same requests on the wire as the
// hand-written one, and hand back the same results and errors: the guard,
// idempotency and retry rules downstream were built on the hand-written one.
// Both are sent through one stub PayPal (the SDK through its axios adapter
// seam, the hand-written client through its fetch option).

interface Seen {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = { status: number; json?: unknown; text?: string } | "network";
const TOKEN = { access_token: "tok", token_type: "Bearer", expires_in: 32400 };
const WATCHED = ["paypal-request-id", "prefer", "paypal-auth-assertion", "paypal-partner-attribution-id"];

function pick(h: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) if (WATCHED.includes(k.toLowerCase()) && v != null) out[k.toLowerCase()] = String(v);
  return out;
}

const parse = (b: unknown) => {
  if (b == null || b === "") return {};
  const v = typeof b === "string" ? JSON.parse(b) : b;
  return v;
};

function pair(reply: (path: string) => Reply, partner?: { merchantId: string; bnCode?: string }) {
  const seen = { hand: [] as Seen[], sdk: [] as Seen[] };
  const answer = (path: string) => (path.startsWith("/v1/oauth2/token") ? ({ status: 200, json: TOKEN } as Reply) : reply(path));

  const hand = new PayPalClient({
    clientId: "cid",
    clientSecret: "sec",
    partner,
    fetch: async (url, init) => {
      const u = new URL(String(url));
      const r = answer(u.pathname + u.search);
      if (!u.pathname.startsWith("/v1/oauth2")) seen.hand.push({ method: init!.method!, path: u.pathname + u.search, headers: pick(init!.headers as Record<string, string>), body: parse(init!.body) });
      if (r === "network") throw new TypeError("fetch failed");
      const text = r.text ?? (r.json === undefined ? "" : JSON.stringify(r.json));
      return new Response(r.status === 204 ? null : text, { status: r.status, headers: { "content-type": "application/json", "paypal-debug-id": "dbg-1" } });
    },
  });

  const sdk = new PayPalSdkClient({
    clientId: "cid",
    clientSecret: "sec",
    partner,
    sdkAdapter: async (raw) => {
      const config = raw as { url: string; method: string; headers: Record<string, unknown>; data?: unknown };
      const u = new URL(config.url);
      const r = answer(u.pathname + u.search);
      if (!u.pathname.startsWith("/v1/oauth2")) {
        const headers = typeof (config.headers as { toJSON?: () => object }).toJSON === "function" ? (config.headers as { toJSON: () => Record<string, unknown> }).toJSON() : config.headers;
        seen.sdk.push({ method: config.method.toUpperCase(), path: u.pathname + u.search, headers: pick(headers), body: parse(config.data) });
      }
      if (r === "network") throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
      const text = r.text ?? (r.json === undefined ? "" : JSON.stringify(r.json));
      return { data: text, status: r.status, statusText: "", headers: { "content-type": "application/json", "paypal-debug-id": "dbg-1" }, config };
    },
  });
  return { hand, sdk, seen };
}

const ORDER = { id: "ORD-1", status: "CREATED", purchase_units: [{ reference_id: "job-1", payee: { merchant_id: "SELLER1" } }], links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORD-1" }] };
const AUTHED = { id: "ORD-1", status: "COMPLETED", purchase_units: [{ payments: { authorizations: [{ id: "AUTH-1", status: "CREATED", amount: { currency_code: "USD", value: "420.00" } }] } }] };
const AUTH = { id: "AUTH-1", status: "CREATED", amount: { currency_code: "USD", value: "420.00" }, expiration_time: "2026-12-01T00:00:00Z" };
const CAPTURE = { id: "CAP-1", status: "COMPLETED", amount: { currency_code: "USD", value: "120.00" }, final_capture: false };
const REFUND = { id: "REF-1", status: "COMPLETED", amount: { currency_code: "USD", value: "40.00" } };

const CALLS: [string, (p: PayPalApi) => Promise<unknown>, unknown][] = [
  [
    "create order (payee, items, partner attribution)",
    (p) =>
      p.createOrder(
        { currency: "USD", invoiceId: "job-1", customId: "hash", description: "Trace job: 12 Admiralty Way", items: [{ code: "L1", title: "Fix dripping tap", priceCents: 12000 }, { code: "L2", title: "Reseal bath edge", priceCents: 30000 }], brandName: "Trace", payeeMerchantId: "SELLER1" },
        "order-job-1",
      ),
    ORDER,
  ],
  ["get order", (p) => p.getOrder("ORD-1"), ORDER],
  ["authorize order", (p) => p.authorizeOrder("ORD-1", "authorize-ORD-1"), AUTHED],
  ["get authorization", (p) => p.getAuthorization("AUTH-1"), AUTH],
  ["capture (partial, with note)", (p) => p.captureAuthorization("AUTH-1", { amountCents: 12000, currency: "USD", invoiceId: "job-1-r1", finalCapture: false, noteToPayer: "L1 tap" }, "cap-job-1-r1"), CAPTURE],
  ["capture (final)", (p) => p.captureAuthorization("AUTH-1", { amountCents: 30000, currency: "USD", invoiceId: "job-1-r2", finalCapture: true }, "cap-job-1-r2"), CAPTURE],
  ["reauthorize (amount)", (p) => p.reauthorize("AUTH-1", { cents: 30000, currency: "USD" }, "reauth-1"), AUTH],
  ["reauthorize (full)", (p) => p.reauthorize("AUTH-1", null, "reauth-2"), AUTH],
  ["get capture", (p) => p.getCapture("CAP-1"), CAPTURE],
  ["refund (part, for the seller)", (p) => p.refundCapture("CAP-1", { cents: 4000, currency: "USD" }, "refund-1", "SELLER1"), REFUND],
  ["refund (full)", (p) => p.refundCapture("CAP-1", null, "refund-2"), REFUND],
];

describe("PayPal Server SDK client matches the hand-written client", () => {
  for (const [name, call, json] of CALLS) {
    it(name, async () => {
      const { hand, sdk, seen } = pair(() => ({ status: 200, json }), { merchantId: "PARTNER1", bnCode: "TRACE_BN" });
      const a = await call(hand);
      const b = await call(sdk);
      expect(b).toEqual(a);
      expect(seen.sdk).toHaveLength(1);
      const [h] = seen.hand;
      const [s] = seen.sdk;
      expect(s!.method).toBe(h!.method);
      expect(s!.path).toBe(h!.path);
      expect(s!.body).toEqual(h!.body);
      // The SDK sends the partner attribution header only where PayPal's spec declares it (creating the order);
      // every other header Trace relies on must match exactly.
      const { "paypal-partner-attribution-id": handBn, ...handRest } = h!.headers;
      const { "paypal-partner-attribution-id": sdkBn, ...sdkRest } = s!.headers;
      expect(sdkRest).toEqual(handRest);
      if (s!.path === "/v2/checkout/orders") expect(sdkBn).toBe(handBn);
    });
  }

  it("void: same request, nothing returned", async () => {
    const { hand, sdk, seen } = pair(() => ({ status: 204 }));
    expect(await hand.voidAuthorization("AUTH-1", "void-1")).toBeUndefined();
    expect(await sdk.voidAuthorization("AUTH-1", "void-1")).toBeUndefined();
    expect(seen.sdk[0]).toMatchObject({ method: "POST", path: "/v2/payments/authorizations/AUTH-1/void", headers: { "paypal-request-id": "void-1" } });
    expect(seen.sdk[0]!.path).toBe(seen.hand[0]!.path);
  });

  it("a PayPal error comes back as the same PayPalError, issues and debug ID included", async () => {
    const err = { name: "UNPROCESSABLE_ENTITY", message: "The requested action could not be performed.", debug_id: "abc123", details: [{ issue: "AUTHORIZATION_VOIDED" }] };
    const { hand, sdk } = pair(() => ({ status: 422, json: err }));
    const capture = (p: PayPalApi) => p.captureAuthorization("AUTH-1", { amountCents: 100, currency: "USD", invoiceId: "x", finalCapture: false }, "r");
    const a = await capture(hand).catch((e: unknown) => e);
    const b = await capture(sdk).catch((e: unknown) => e);
    expect(b).toBeInstanceOf(PayPalError);
    expect(b).toMatchObject({ status: 422, errorName: "UNPROCESSABLE_ENTITY", issues: ["AUTHORIZATION_VOIDED"], debugId: "abc123", retryable: false });
    expect((b as PayPalError).message).toBe((a as PayPalError).message);
    expect((b as PayPalError).has("AUTHORIZATION_VOIDED")).toBe(true);
  });

  it("a 5xx is retryable, and no answer at all is a network error, so captures retry with the same request ID", async () => {
    const down = pair(() => ({ status: 503, json: { name: "SERVICE_UNAVAILABLE", message: "try later" } }));
    await expect(down.sdk.getAuthorization("AUTH-1")).rejects.toMatchObject({ status: 503, retryable: true });
    const gone = pair(() => "network");
    await expect(gone.sdk.captureAuthorization("AUTH-1", { amountCents: 100, currency: "USD", invoiceId: "x", finalCapture: false }, "r")).rejects.toBeInstanceOf(PayPalNetworkError);
    await expect(gone.hand.captureAuthorization("AUTH-1", { amountCents: 100, currency: "USD", invoiceId: "x", finalCapture: false }, "r")).rejects.toBeInstanceOf(PayPalNetworkError);
  });

  it("a successful answer the SDK's schema doesn't recognise still counts: the money moved", async () => {
    const odd = { ...CAPTURE, status: "SOME_NEW_STATUS", amount: { currency_code: "USD" } };
    const { sdk } = pair(() => ({ status: 201, json: odd }));
    expect(await sdk.captureAuthorization("AUTH-1", { amountCents: 100, currency: "USD", invoiceId: "x", finalCapture: false }, "r")).toEqual(odd);
  });
});

describe("PayPal Server SDK client: requests it refuses to send", () => {
  it("a malformed request is an error, never a retryable network failure", async () => {
    const { sdk, seen } = pair(() => ({ status: 200, json: CAPTURE }));
    const err = await sdk.captureAuthorization("AUTH-1", { amountCents: 100, currency: "USD", invoiceId: undefined as unknown as string, finalCapture: "yes" as unknown as boolean }, "r").catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(PayPalNetworkError);
    expect(err).toBeInstanceOf(Error);
    expect(seen.sdk).toHaveLength(0);
  });
});
