// The PayPal operations Trace uses. PayPalClient talks to PayPal; FakePayPal
// (./fake.ts) follows the same rules in memory for tests.

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

export interface PayPalApi {
  createOrder(input: CreateOrderInput, requestId: string): Promise<Order>;
  getOrder(orderId: string): Promise<Order>;
  authorizeOrder(orderId: string, requestId: string): Promise<Order>;
  getAuthorization(authorizationId: string): Promise<Authorization>;
  captureAuthorization(authorizationId: string, input: CaptureInput, requestId: string): Promise<Capture>;
  reauthorize(authorizationId: string, amount: { cents: number; currency: string } | null, requestId: string): Promise<Authorization>;
  voidAuthorization(authorizationId: string, requestId: string): Promise<void>;
  getCapture(captureId: string): Promise<Capture>;
  refundCapture(captureId: string, amount: { cents: number; currency: string } | null, requestId: string): Promise<Refund>;
  listDisputesForTransaction(transactionId: string): Promise<Dispute[]>;
  getDispute(disputeId: string): Promise<Dispute>;
  provideEvidence(disputeId: string, evidence: EvidenceInput): Promise<void>;
  /** Sandbox only: move a dispute to WAITING_FOR_SELLER_RESPONSE. */
  requireEvidence(disputeId: string): Promise<void>;
  /** `rawEvent` is the webhook's body exactly as received. */
  verifyWebhook(headers: WebhookHeaders, rawEvent: string, webhookId: string): Promise<boolean>;
}

/** The first authorization on an authorized order. */
export function authorizationOf(order: Order): Authorization {
  const auth = order.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth) throw new Error(`order ${order.id} has no authorization`);
  return auth;
}
