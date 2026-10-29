// An in-memory PayPal that enforces the authorize/capture rules Trace relies
// on: idempotent request IDs, capture caps, final capture, void, reauthorize.
// Issue names follow PayPal's where we know them.

import { fromPayPalValue, toPayPalValue, sum } from "@trace/core";
import type { PayPalApi } from "./api.ts";
import { PayPalError, PayPalNetworkError } from "./errors.ts";
import type {
  Authorization,
  Capture,
  CaptureInput,
  CaptureStatus,
  CreateOrderInput,
  Dispute,
  EvidenceInput,
  Order,
  PartnerReferralInput,
  Refund,
  SellerStatus,
  WebhookHeaders,
} from "./types.ts";

interface FakeAuth {
  id: string;
  orderId: string;
  currency: string;
  amountCents: number;
  capturedCents: number;
  status: Authorization["status"];
  invoiceId: string;
  customId: string;
  reauthorized: boolean;
  supersededBy: string | null;
  createdAt: Date;
}

interface FakeOrder {
  id: string;
  status: "CREATED" | "APPROVED" | "COMPLETED";
  input: CreateOrderInput;
  authId: string | null;
}

type Op = keyof PayPalApi;

function unprocessable(issue: string, message = issue): PayPalError {
  return new PayPalError(422, "UNPROCESSABLE_ENTITY", message, [issue], "fake-debug", { name: "UNPROCESSABLE_ENTITY", details: [{ issue }] });
}

function denied(message: string): PayPalError {
  return new PayPalError(403, "PERMISSION_DENIED", message, ["PERMISSION_DENIED"], "fake-debug", {});
}

function notFound(what: string): PayPalError {
  return new PayPalError(404, "RESOURCE_NOT_FOUND", `${what} not found`, ["INVALID_RESOURCE_ID"], "fake-debug", {});
}

export class FakePayPal implements PayPalApi {
  readonly orders = new Map<string, FakeOrder>();
  readonly auths = new Map<string, FakeAuth>();
  readonly captures = new Map<string, Capture & { authId: string; cents: number }>();
  readonly disputes = new Map<string, Dispute & { evidence: EvidenceInput[] }>();
  readonly calls: { op: Op; args: unknown[] }[] = [];
  /** Sellers who signed up through a partner referral, by tracking ID. */
  readonly sellers = new Map<string, Omit<SellerStatus, "trackingId">>();
  readonly referrals = new Set<string>();
  /** Whether a partially captured authorization may be reauthorized (spec section 17: unconfirmed). */
  allowReauthorizeAfterPartialCapture = true;
  webhookVerdict = true;
  /** Status the next captures come back with. */
  nextCaptureStatus: CaptureStatus = "COMPLETED";
  private readonly idempotent = new Map<string, unknown>();
  private readonly invoices = new Set<string>();
  private readonly faults = new Map<Op, unknown[]>();
  private readonly lost = new Set<Op>();
  private seq = 0;

  constructor(private readonly now: () => Date = () => new Date()) {}

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}${String(this.seq).padStart(8, "0")}`;
  }

  /** Make the next call to `op` throw `err` (default: a lost connection, after the work was done or not). */
  failNext(op: Op, err: unknown = new PayPalNetworkError(new Error("socket hang up"))): void {
    const q = this.faults.get(op) ?? [];
    q.push(err);
    this.faults.set(op, q);
  }

  /** Do the next `op` at PayPal, then lose its response, as a timeout after the work landed does. */
  loseNextResponse(op: Op): void {
    this.lost.add(op);
  }

  private enter(op: Op, args: unknown[]): void {
    this.calls.push({ op, args });
    const q = this.faults.get(op);
    const fault = q?.shift();
    if (fault) throw fault;
  }

  private once<T>(op: Op, requestId: string, run: () => T): T {
    const key = `${op}:${requestId}`;
    if (this.idempotent.has(key)) return structuredClone(this.idempotent.get(key)) as T;
    const out = run();
    this.idempotent.set(key, structuredClone(out));
    if (this.lost.delete(op)) throw new PayPalNetworkError(new Error("timeout after the request landed"));
    return out;
  }

  /** Test helper: the buyer approves the order in PayPal's window. */
  approve(orderId: string): void {
    const o = this.orders.get(orderId);
    if (!o) throw notFound(`order ${orderId}`);
    o.status = "APPROVED";
  }

  /** Test helper: the buyer opens a dispute against a capture. */
  openDispute(captureId: string, reason = "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED"): Dispute {
    const cap = this.captures.get(captureId);
    if (!cap) throw notFound(`capture ${captureId}`);
    const d = {
      dispute_id: this.id("PP-D-"),
      reason,
      status: "OPEN",
      dispute_amount: cap.amount,
      disputed_transactions: [{ seller_transaction_id: captureId, invoice_number: cap.invoice_id }],
      evidence: [],
    };
    this.disputes.set(d.dispute_id, d);
    return d;
  }

  /** Test helper: the seller finishes PayPal sign-up for a referral. Returns their merchant ID. */
  onboard(trackingId: string, opts: Partial<Omit<SellerStatus, "trackingId" | "merchantId">> = {}): string {
    const prior = this.sellers.get(trackingId);
    const merchantId = prior?.merchantId ?? this.id("MERCH");
    this.sellers.set(trackingId, { merchantId, paymentsReceivable: true, emailConfirmed: true, permissionsGranted: true, ...opts });
    return merchantId;
  }

  /** Whose PayPal account a capture paid into: the order's payee, or Trace's own (null). */
  payeeOfCapture(captureId: string): string | null {
    const c = this.captures.get(captureId);
    const a = c ? this.auths.get(c.authId) : undefined;
    return (a && this.orders.get(a.orderId)?.input.payeeMerchantId) || null;
  }

  /** A payee's resources can only be touched while acting for that payee. */
  private actFor(captureId: string, seller: string | null | undefined): void {
    const payee = this.payeeOfCapture(captureId);
    if (payee && seller !== payee) throw denied("the capture belongs to a seller this call doesn't act for");
  }

  /** Test helper: expire an authorization, as PayPal's negative testing does. */
  expire(authId: string): void {
    const a = this.auths.get(authId);
    if (a) a.status = "VOIDED";
  }

  private authView(a: FakeAuth): Authorization {
    const exp = new Date(a.createdAt.getTime() + 29 * 86_400_000);
    return {
      id: a.id,
      status: a.status,
      amount: { currency_code: a.currency, value: toPayPalValue(a.amountCents) },
      invoice_id: a.invoiceId,
      custom_id: a.customId,
      expiration_time: exp.toISOString(),
      create_time: a.createdAt.toISOString(),
    };
  }

  private orderView(o: FakeOrder): Order {
    const total = sum(o.input.items.map((i) => i.priceCents));
    const auth = o.authId ? this.auths.get(o.authId) : undefined;
    return {
      id: o.id,
      status: o.status,
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: o.input.invoiceId,
          invoice_id: o.input.invoiceId,
          custom_id: o.input.customId,
          amount: { currency_code: o.input.currency, value: toPayPalValue(total) },
          ...(o.input.payeeMerchantId ? { payee: { merchant_id: o.input.payeeMerchantId } } : {}),
          ...(auth ? { payments: { authorizations: [this.authView(auth)] } } : {}),
        },
      ],
    };
  }

  async createOrder(input: CreateOrderInput, requestId: string): Promise<Order> {
    this.enter("createOrder", [input, requestId]);
    return this.once("createOrder", requestId, () => {
      const o: FakeOrder = { id: this.id("ORDER"), status: "CREATED", input: structuredClone(input), authId: null };
      this.orders.set(o.id, o);
      return this.orderView(o);
    });
  }

  async getOrder(orderId: string): Promise<Order> {
    this.enter("getOrder", [orderId]);
    const o = this.orders.get(orderId);
    if (!o) throw notFound(`order ${orderId}`);
    return this.orderView(o);
  }

  async authorizeOrder(orderId: string, requestId: string): Promise<Order> {
    this.enter("authorizeOrder", [orderId, requestId]);
    return this.once("authorizeOrder", requestId, () => {
      const o = this.orders.get(orderId);
      if (!o) throw notFound(`order ${orderId}`);
      if (o.status === "COMPLETED") throw unprocessable("ORDER_ALREADY_AUTHORIZED");
      if (o.status !== "APPROVED") throw unprocessable("ORDER_NOT_APPROVED");
      const a: FakeAuth = {
        id: this.id("AUTH"),
        orderId,
        currency: o.input.currency,
        amountCents: sum(o.input.items.map((i) => i.priceCents)),
        capturedCents: 0,
        status: "CREATED",
        invoiceId: o.input.invoiceId,
        customId: o.input.customId,
        reauthorized: false,
        supersededBy: null,
        createdAt: this.now(),
      };
      this.auths.set(a.id, a);
      o.status = "COMPLETED";
      o.authId = a.id;
      return this.orderView(o);
    });
  }

  private auth(id: string): FakeAuth {
    const a = this.auths.get(id);
    if (!a) throw notFound(`authorization ${id}`);
    return a;
  }

  async getAuthorization(id: string): Promise<Authorization> {
    this.enter("getAuthorization", [id]);
    return this.authView(this.auth(id));
  }

  async captureAuthorization(id: string, input: CaptureInput, requestId: string): Promise<Capture> {
    this.enter("captureAuthorization", [id, input, requestId]);
    return this.once("captureAuthorization", requestId, () => {
      const a = this.auth(id);
      if (a.supersededBy) throw unprocessable("AUTHORIZATION_ALREADY_REAUTHORIZED");
      if (a.status === "VOIDED") throw unprocessable("AUTHORIZATION_VOIDED");
      if (a.status === "CAPTURED") throw unprocessable("AUTHORIZATION_ALREADY_CAPTURED");
      if (input.currency !== a.currency) throw unprocessable("CURRENCY_MISMATCH");
      if (input.amountCents <= 0) throw unprocessable("INVALID_PARAMETER_VALUE");
      if (a.capturedCents + input.amountCents > a.amountCents) throw unprocessable("MAX_CAPTURE_AMOUNT_EXCEEDED");
      if (this.invoices.has(input.invoiceId)) throw unprocessable("DUPLICATE_INVOICE_ID");
      this.invoices.add(input.invoiceId);
      const status = this.nextCaptureStatus;
      const cap = {
        id: this.id("CAP"),
        status,
        amount: { currency_code: input.currency, value: toPayPalValue(input.amountCents) },
        invoice_id: input.invoiceId,
        final_capture: input.finalCapture,
        create_time: this.now().toISOString(),
        authId: a.id,
        cents: input.amountCents,
      };
      this.captures.set(cap.id, cap);
      if (status !== "DECLINED" && status !== "FAILED") {
        a.capturedCents += input.amountCents;
        a.status = input.finalCapture || a.capturedCents === a.amountCents ? "CAPTURED" : "PARTIALLY_CAPTURED";
      }
      const { authId: _a, cents: _c, ...view } = cap;
      return view;
    });
  }

  async reauthorize(id: string, amount: { cents: number; currency: string } | null, requestId: string): Promise<Authorization> {
    this.enter("reauthorize", [id, amount, requestId]);
    return this.once("reauthorize", requestId, () => {
      const a = this.auth(id);
      if (a.reauthorized || a.supersededBy) throw unprocessable("MAX_NUMBER_OF_REAUTHORIZATIONS_EXCEEDED");
      if (a.status === "VOIDED" || a.status === "CAPTURED") throw unprocessable("AUTHORIZATION_ALREADY_CAPTURED_OR_VOIDED");
      if (a.status === "PARTIALLY_CAPTURED" && !this.allowReauthorizeAfterPartialCapture) {
        throw unprocessable("REAUTHORIZATION_NOT_ALLOWED_AFTER_CAPTURE");
      }
      const cents = amount?.cents ?? a.amountCents - a.capturedCents;
      const b: FakeAuth = {
        ...a,
        id: this.id("AUTH"),
        amountCents: a.capturedCents + cents,
        reauthorized: true,
        supersededBy: null,
        createdAt: this.now(),
      };
      a.supersededBy = b.id;
      this.auths.set(b.id, b);
      return this.authView(b);
    });
  }

  async voidAuthorization(id: string, requestId: string): Promise<void> {
    this.enter("voidAuthorization", [id, requestId]);
    this.once("voidAuthorization", requestId, () => {
      const a = this.auth(id);
      if (a.status === "VOIDED") throw unprocessable("PREVIOUSLY_VOIDED");
      if (a.status === "CAPTURED") throw unprocessable("PREVIOUSLY_CAPTURED");
      a.status = "VOIDED";
      return null;
    });
  }

  async getCapture(id: string): Promise<Capture> {
    this.enter("getCapture", [id]);
    const c = this.captures.get(id);
    if (!c) throw notFound(`capture ${id}`);
    const { authId: _a, cents: _c, ...view } = c;
    return view;
  }

  async refundCapture(id: string, amount: { cents: number; currency: string } | null, requestId: string, seller?: string | null): Promise<Refund> {
    this.enter("refundCapture", [id, amount, requestId, seller]);
    return this.once("refundCapture", requestId, () => {
      const c = this.captures.get(id);
      if (!c) throw notFound(`capture ${id}`);
      this.actFor(id, seller);
      const cents = amount?.cents ?? c.cents;
      if (cents > c.cents) throw unprocessable("REFUND_AMOUNT_EXCEEDED");
      c.status = cents === c.cents ? "REFUNDED" : "PARTIALLY_REFUNDED";
      return { id: this.id("REF"), status: "COMPLETED", amount: { currency_code: c.amount?.currency_code ?? "USD", value: toPayPalValue(cents) } };
    });
  }

  async listDisputesForTransaction(transactionId: string, seller?: string | null): Promise<Dispute[]> {
    this.enter("listDisputesForTransaction", [transactionId, seller]);
    if (this.captures.has(transactionId)) this.actFor(transactionId, seller);
    return [...this.disputes.values()]
      .filter((d) => d.disputed_transactions?.some((t) => t.seller_transaction_id === transactionId))
      .map(({ evidence: _e, ...d }) => d);
  }

  private disputeFor(id: string, seller: string | null | undefined) {
    const d = this.disputes.get(id);
    if (!d) throw notFound(`dispute ${id}`);
    const cap = d.disputed_transactions?.[0]?.seller_transaction_id;
    if (cap) this.actFor(cap, seller);
    return d;
  }

  async getDispute(id: string, seller?: string | null): Promise<Dispute> {
    this.enter("getDispute", [id, seller]);
    const d = this.disputeFor(id, seller);
    const { evidence: _e, ...view } = d;
    return view;
  }

  async provideEvidence(id: string, evidence: EvidenceInput, seller?: string | null): Promise<void> {
    this.enter("provideEvidence", [id, evidence, seller]);
    const d = this.disputeFor(id, seller);
    if (d.status !== "WAITING_FOR_SELLER_RESPONSE") throw unprocessable("NOT_ALLOWED_IN_CURRENT_STATE");
    d.evidence.push(evidence);
    d.status = "UNDER_REVIEW";
  }

  async requireEvidence(id: string, seller?: string | null): Promise<void> {
    this.enter("requireEvidence", [id, seller]);
    const d = this.disputeFor(id, seller);
    d.status = "WAITING_FOR_SELLER_RESPONSE";
  }

  async createPartnerReferral(input: PartnerReferralInput): Promise<{ actionUrl: string }> {
    this.enter("createPartnerReferral", [input]);
    this.referrals.add(input.trackingId);
    return { actionUrl: `https://www.sandbox.paypal.com/bizsignup/fake?tracking=${encodeURIComponent(input.trackingId)}` };
  }

  async findSeller(trackingId: string): Promise<string | null> {
    this.enter("findSeller", [trackingId]);
    return this.sellers.get(trackingId)?.merchantId ?? null;
  }

  async sellerStatus(merchantId: string): Promise<SellerStatus> {
    this.enter("sellerStatus", [merchantId]);
    for (const [trackingId, s] of this.sellers) if (s.merchantId === merchantId) return { trackingId, ...s };
    throw notFound(`merchant ${merchantId}`);
  }

  async verifyWebhook(headers: WebhookHeaders, rawEvent: string, webhookId: string): Promise<boolean> {
    this.enter("verifyWebhook", [headers, rawEvent, webhookId]);
    return this.webhookVerdict;
  }

  /** Total captured on an authorization, read back in cents. */
  capturedOn(authId: string): number {
    return [...this.captures.values()]
      .filter((c) => c.authId === authId && c.status !== "DECLINED" && c.status !== "FAILED")
      .reduce((n, c) => n + fromPayPalValue(c.amount?.value ?? "0"), 0);
  }
}
