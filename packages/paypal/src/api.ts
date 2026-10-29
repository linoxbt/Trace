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
  PartnerReferralInput,
  Refund,
  SellerStatus,
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
  // `seller` is the payee's merchant ID. Refunds and disputes belong to the
  // seller's account, so these calls act on their behalf (PayPal-Auth-Assertion).
  refundCapture(captureId: string, amount: { cents: number; currency: string } | null, requestId: string, seller?: string | null): Promise<Refund>;
  listDisputesForTransaction(transactionId: string, seller?: string | null): Promise<Dispute[]>;
  getDispute(disputeId: string, seller?: string | null): Promise<Dispute>;
  provideEvidence(disputeId: string, evidence: EvidenceInput, seller?: string | null): Promise<void>;
  /** Sandbox only: move a dispute to WAITING_FOR_SELLER_RESPONSE. */
  requireEvidence(disputeId: string, seller?: string | null): Promise<void>;
  /** Start a tradesperson's PayPal sign-up (Partner Referrals). The URL works once. */
  createPartnerReferral(input: PartnerReferralInput): Promise<{ actionUrl: string }>;
  /** The merchant ID PayPal gave the seller we referred with `trackingId`, or null if they haven't finished. */
  findSeller(trackingId: string): Promise<string | null>;
  sellerStatus(merchantId: string): Promise<SellerStatus>;
  /** `rawEvent` is the webhook's body exactly as received. */
  verifyWebhook(headers: WebhookHeaders, rawEvent: string, webhookId: string): Promise<boolean>;
}

/** The first authorization on an authorized order. */
export function authorizationOf(order: Order): Authorization {
  const auth = order.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth) throw new Error(`order ${order.id} has no authorization`);
  return auth;
}
