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
  PartnerReferralInput,
  Refund,
  SellerStatus,
  WebhookHeaders,
} from "./types.ts";

export const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";
export const LIVE_BASE = "https://api-m.paypal.com";

/**
 * What a tradesperson lets Trace do on their PayPal account. These must match
 * the features turned on for the REST app, and the dispute ones need the app's
 * Disputes API toggle.
 */
export const PARTNER_FEATURES = ["PAYMENT", "REFUND", "READ_SELLER_DISPUTE", "UPDATE_SELLER_DISPUTE"] as const;

export interface PayPalClientOptions {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Multipart field name for the evidence file. Spec section 17 lists it as unconfirmed. */
  evidenceFileField?: string;
  /**
   * Trace as a PayPal partner: its own merchant ID (for seller sign-up and
   * status) and its BN code, sent as PayPal-Partner-Attribution-Id.
   */
  partner?: { merchantId: string; bnCode?: string };
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
  /** Act for this seller (their merchant ID) with a PayPal-Auth-Assertion. */
  seller?: string | null;
}

const b64url = (s: string) => Buffer.from(s).toString("base64url");

/** PayPal's unsigned assertion naming the seller a partner acts for. The trailing dot is required. */
export function authAssertion(clientId: string, sellerMerchantId: string): string {
  return `${b64url(JSON.stringify({ alg: "none" }))}.${b64url(JSON.stringify({ iss: clientId, payer_id: sellerMerchantId }))}.`;
}

export class PayPalNotPartner extends Error {
  constructor() {
    super("PayPal partner settings are missing: set PAYPAL_PARTNER_MERCHANT_ID");
  }
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
    if (this.opts.partner?.bnCode) headers["PayPal-Partner-Attribution-Id"] = this.opts.partner.bnCode;
    if (o.seller) headers["PayPal-Auth-Assertion"] = authAssertion(this.opts.clientId, o.seller);
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
    if (res.status === 404 && o.allow404) return null as T;
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
            ...(input.payeeMerchantId ? { payee: { merchant_id: input.payeeMerchantId } } : {}),
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

  refundCapture(id: string, amount: { cents: number; currency: string } | null, requestId: string, seller?: string | null): Promise<Refund> {
    return this.request<Refund>("POST", `/v2/payments/captures/${encodeURIComponent(id)}/refund`, {
      requestId,
      seller,
      representation: true,
      body: amount ? { amount: { currency_code: amount.currency, value: toPayPalValue(amount.cents) } } : {},
    });
  }

  async listDisputesForTransaction(transactionId: string, seller?: string | null): Promise<Dispute[]> {
    const res = await this.request<{ items?: Dispute[] }>(
      "GET",
      `/v1/customer/disputes?disputed_transaction_id=${encodeURIComponent(transactionId)}`,
      { seller },
    );
    return res.items ?? [];
  }

  getDispute(id: string, seller?: string | null): Promise<Dispute> {
    return this.request<Dispute>("GET", `/v1/customer/disputes/${encodeURIComponent(id)}`, { seller });
  }

  async provideEvidence(id: string, evidence: EvidenceInput, seller?: string | null): Promise<void> {
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
    await this.request<unknown>("POST", `/v1/customer/disputes/${encodeURIComponent(id)}/provide-evidence`, { form, seller });
  }

  async requireEvidence(id: string, seller?: string | null): Promise<void> {
    await this.request<unknown>("POST", `/v1/customer/disputes/${encodeURIComponent(id)}/require-evidence`, {
      body: { action: "SELLER_EVIDENCE" },
      seller,
    });
  }

  private partnerId(): string {
    if (!this.opts.partner?.merchantId) throw new PayPalNotPartner();
    return encodeURIComponent(this.opts.partner.merchantId);
  }

  async createPartnerReferral(input: PartnerReferralInput): Promise<{ actionUrl: string }> {
    this.partnerId();
    const res = await this.request<{ links?: { rel: string; href: string }[] }>("POST", "/v2/customer/partner-referrals", {
      body: {
        tracking_id: input.trackingId,
        partner_config_override: { return_url: input.returnUrl, return_url_description: "Back to Trace" },
        operations: [
          {
            operation: "API_INTEGRATION",
            api_integration_preference: {
              rest_api_integration: {
                integration_method: "PAYPAL",
                integration_type: "THIRD_PARTY",
                third_party_details: { features: PARTNER_FEATURES },
              },
            },
          },
        ],
        products: ["EXPRESS_CHECKOUT"],
        legal_consents: [{ type: "SHARE_DATA_CONSENT", granted: true }],
      },
    });
    const url = res.links?.find((l) => l.rel === "action_url")?.href;
    if (!url) throw new Error("PayPal didn't return a sign-up link");
    return { actionUrl: url };
  }

  async findSeller(trackingId: string): Promise<string | null> {
    const res = await this.request<{ merchant_id?: string } | null>(
      "GET",
      `/v1/customer/partners/${this.partnerId()}/merchant-integrations?tracking_id=${encodeURIComponent(trackingId)}`,
      { allow404: true },
    );
    return res?.merchant_id || null;
  }

  async sellerStatus(merchantId: string): Promise<SellerStatus> {
    const r = await this.request<{
      merchant_id: string;
      tracking_id?: string;
      payments_receivable?: boolean;
      primary_email_confirmed?: boolean;
      oauth_integrations?: { integration_type?: string; oauth_third_party?: { scopes?: string[] }[] }[];
    }>("GET", `/v1/customer/partners/${this.partnerId()}/merchant-integrations/${encodeURIComponent(merchantId)}`);
    return {
      merchantId: r.merchant_id,
      trackingId: r.tracking_id ?? null,
      paymentsReceivable: r.payments_receivable === true,
      emailConfirmed: r.primary_email_confirmed === true,
      permissionsGranted: (r.oauth_integrations ?? []).some(
        (o) => o.integration_type === "OAUTH_THIRD_PARTY" && (o.oauth_third_party ?? []).some((t) => (t.scopes?.length ?? 0) > 0),
      ),
    };
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
