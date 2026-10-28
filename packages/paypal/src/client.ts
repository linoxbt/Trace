import { toPayPalValue, sum } from "@trace/core";
import type { PayPalApi } from "./api.ts";
import { PayPalError, PayPalNetworkError } from "./errors.ts";
import type {
  Authorization,
  Capture,
  CaptureInput,
  CreateOrderInput,
  Dispute,
  EvidenceInput,
  Order,
  Refund,
  WebhookHeaders,
} from "./types.ts";

export const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";
export const LIVE_BASE = "https://api-m.paypal.com";

export interface PayPalClientOptions {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Multipart field name for the evidence file. Spec section 17 lists it as unconfirmed. */
  evidenceFileField?: string;
}

interface RequestOptions {
  body?: unknown;
  /** A JSON body already serialised, sent as is. */
  rawJson?: string;
  form?: FormData;
  requestId?: string;
  /** Prefer: return=representation, so writes answer with the full resource. */
  representation?: boolean;
  allow404?: boolean;
}

export class PayPalClient implements PayPalApi {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private token: { value: string; expiresAt: number } | null = null;
  private tokenPending: Promise<string> | null = null;

  constructor(private readonly opts: PayPalClientOptions) {
    this.base = (opts.baseUrl ?? SANDBOX_BASE).replace(/\/$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(this.opts.timeoutMs ?? 30_000) });
    } catch (err) {
      throw new PayPalNetworkError(err);
    }
  }

  /** Client-credentials token, cached until 60 s before it expires. */
  async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    this.tokenPending ??= (async () => {
      try {
        const res = await this.send(`${this.base}/v1/oauth2/token`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.opts.clientId}:${this.opts.clientSecret}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: "grant_type=client_credentials",
        });
        if (!res.ok) throw await PayPalError.from(res);
        const json = (await res.json()) as { access_token: string; expires_in: number };
        this.token = { value: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
        return json.access_token;
      } finally {
        this.tokenPending = null;
      }
    })();
    return this.tokenPending;
  }

  private async request<T>(method: string, path: string, o: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.accessToken()}`,
      Accept: "application/json",
    };
    if (o.requestId) headers["PayPal-Request-Id"] = o.requestId;
    if (o.representation) headers["Prefer"] = "return=representation";
    let body: BodyInit | undefined;
    if (o.form) body = o.form;
    else if (o.rawJson !== undefined) {
      headers["Content-Type"] = "application/json";
      body = o.rawJson;
    } else if (o.body !== undefined || method === "POST") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(o.body ?? {});
    }
    const res = await this.send(`${this.base}${path}`, { method, headers, body });
    if (res.status === 401) this.token = null;
    if (!res.ok) throw await PayPalError.from(res);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  createOrder(input: CreateOrderInput, requestId: string): Promise<Order> {
    const total = sum(input.items.map((i) => i.priceCents));
    const money = (cents: number) => ({ currency_code: input.currency, value: toPayPalValue(cents) });
    return this.request<Order>("POST", "/v2/checkout/orders", {
      requestId,
      representation: true,
      body: {
        intent: "AUTHORIZE",
        purchase_units: [
          {
            reference_id: input.invoiceId,
            invoice_id: input.invoiceId,
            custom_id: input.customId,
            description: input.description.slice(0, 127),
            amount: { ...money(total), breakdown: { item_total: money(total) } },
            items: input.items.map((i) => ({
              name: `${i.code} ${i.title}`.slice(0, 127),
              sku: i.code,
              quantity: "1",
              unit_amount: money(i.priceCents),
            })),
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: (input.brandName ?? "Trace").slice(0, 127),
              shipping_preference: "NO_SHIPPING",
              user_action: "CONTINUE",
            },
          },
        },
      },
    });
  }

  getOrder(orderId: string): Promise<Order> {
    return this.request<Order>("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  }

  authorizeOrder(orderId: string, requestId: string): Promise<Order> {
    return this.request<Order>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {
      requestId,
      representation: true,
    });
  }

  getAuthorization(id: string): Promise<Authorization> {
    return this.request<Authorization>("GET", `/v2/payments/authorizations/${encodeURIComponent(id)}`);
  }

  captureAuthorization(id: string, input: CaptureInput, requestId: string): Promise<Capture> {
    return this.request<Capture>("POST", `/v2/payments/authorizations/${encodeURIComponent(id)}/capture`, {
      requestId,
      representation: true,
      body: {
        amount: { currency_code: input.currency, value: toPayPalValue(input.amountCents) },
        invoice_id: input.invoiceId,
        final_capture: input.finalCapture,
        ...(input.noteToPayer ? { note_to_payer: input.noteToPayer.slice(0, 255) } : {}),
      },
    });
  }

  reauthorize(id: string, amount: { cents: number; currency: string } | null, requestId: string): Promise<Authorization> {
    return this.request<Authorization>("POST", `/v2/payments/authorizations/${encodeURIComponent(id)}/reauthorize`, {
      requestId,
      representation: true,
      body: amount ? { amount: { currency_code: amount.currency, value: toPayPalValue(amount.cents) } } : {},
    });
  }

  async voidAuthorization(id: string, requestId: string): Promise<void> {
    await this.request<unknown>("POST", `/v2/payments/authorizations/${encodeURIComponent(id)}/void`, { requestId });
  }

  getCapture(id: string): Promise<Capture> {
    return this.request<Capture>("GET", `/v2/payments/captures/${encodeURIComponent(id)}`);
  }

  refundCapture(id: string, amount: { cents: number; currency: string } | null, requestId: string): Promise<Refund> {
    return this.request<Refund>("POST", `/v2/payments/captures/${encodeURIComponent(id)}/refund`, {
      requestId,
      representation: true,
      body: amount ? { amount: { currency_code: amount.currency, value: toPayPalValue(amount.cents) } } : {},
    });
  }

  async listDisputesForTransaction(transactionId: string): Promise<Dispute[]> {
    const res = await this.request<{ items?: Dispute[] }>(
      "GET",
      `/v1/customer/disputes?disputed_transaction_id=${encodeURIComponent(transactionId)}`,
    );
    return res.items ?? [];
  }

  getDispute(id: string): Promise<Dispute> {
    return this.request<Dispute>("GET", `/v1/customer/disputes/${encodeURIComponent(id)}`);
  }

  async provideEvidence(id: string, evidence: EvidenceInput): Promise<void> {
    const form = new FormData();
    const input = {
      evidences: [
        {
          evidence_type: evidence.evidenceType,
          notes: evidence.notes.slice(0, 2000),
          documents: [{ name: evidence.file.name }],
        },
      ],
    };
    form.append("input", new Blob([JSON.stringify(input)], { type: "application/json" }), "input.json");
    form.append(
      this.opts.evidenceFileField ?? "file1",
      new Blob([evidence.file.bytes as Uint8Array<ArrayBuffer>], { type: evidence.file.contentType }),
      evidence.file.name,
    );
    await this.request<unknown>("POST", `/v1/customer/disputes/${encodeURIComponent(id)}/provide-evidence`, { form });
  }

  async requireEvidence(id: string): Promise<void> {
    await this.request<unknown>("POST", `/v1/customer/disputes/${encodeURIComponent(id)}/require-evidence`, {
      body: { action: "SELLER_EVIDENCE" },
    });
  }

  async verifyWebhook(h: WebhookHeaders, rawEvent: string, webhookId: string): Promise<boolean> {
    // The event goes back byte for byte: re-serialising it can change the
    // signed payload and fail verification.
    const head = JSON.stringify({
      auth_algo: h.authAlgo,
      cert_url: h.certUrl,
      transmission_id: h.transmissionId,
      transmission_sig: h.transmissionSig,
      transmission_time: h.transmissionTime,
      webhook_id: webhookId,
    });
    const res = await this.request<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
      rawJson: `${head.slice(0, -1)},"webhook_event":${rawEvent.trim()}}`,
    });
    return res.verification_status === "SUCCESS";
  }
}

/** Read PayPal's webhook headers from a request's headers. Missing ones make the webhook unverifiable. */
export function webhookHeaders(get: (name: string) => string | null): WebhookHeaders | null {
  const h = {
    authAlgo: get("paypal-auth-algo"),
    certUrl: get("paypal-cert-url"),
    transmissionId: get("paypal-transmission-id"),
    transmissionSig: get("paypal-transmission-sig"),
    transmissionTime: get("paypal-transmission-time"),
  };
  return Object.values(h).every((v) => !!v) ? (h as WebhookHeaders) : null;
}
