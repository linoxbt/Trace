// The slices of PayPal's REST resources Trace reads. Field names are PayPal's.

export interface Money {
  currency_code: string;
  value: string;
}

export interface Link {
  href: string;
  rel: string;
  method?: string;
}

export type AuthorizationStatus = "CREATED" | "CAPTURED" | "DENIED" | "PARTIALLY_CAPTURED" | "VOIDED" | "PENDING";

export interface Authorization {
  id: string;
  status: AuthorizationStatus;
  amount?: Money;
  invoice_id?: string;
  custom_id?: string;
  expiration_time?: string;
  create_time?: string;
  update_time?: string;
  links?: Link[];
}

export type CaptureStatus = "COMPLETED" | "DECLINED" | "PARTIALLY_REFUNDED" | "PENDING" | "REFUNDED" | "FAILED";

export interface Capture {
  id: string;
  status: CaptureStatus;
  amount?: Money;
  invoice_id?: string;
  final_capture?: boolean;
  status_details?: { reason?: string };
  create_time?: string;
  links?: Link[];
}

export interface Refund {
  id: string;
  status: string;
  amount?: Money;
}

export interface OrderItem {
  name: string;
  quantity: string;
  unit_amount: Money;
  description?: string;
  sku?: string;
}

export interface CreateOrderInput {
  currency: string;
  /** Our job ID. */
  invoiceId: string;
  /** The frozen scope hash. */
  customId: string;
  description: string;
  items: { code: string; title: string; priceCents: number }[];
  brandName?: string;
}

export interface Order {
  id: string;
  status: string;
  intent?: string;
  purchase_units?: {
    reference_id?: string;
    invoice_id?: string;
    custom_id?: string;
    amount?: Money;
    payments?: { authorizations?: Authorization[]; captures?: Capture[] };
  }[];
  links?: Link[];
}

export interface CaptureInput {
  amountCents: number;
  currency: string;
  invoiceId: string;
  finalCapture: boolean;
  noteToPayer?: string;
}

export interface Dispute {
  dispute_id: string;
  reason?: string;
  status?: string;
  dispute_state?: string;
  dispute_amount?: Money;
  disputed_transactions?: { seller_transaction_id?: string; invoice_number?: string; custom?: string }[];
  seller_response_due_date?: string;
  create_time?: string;
  update_time?: string;
}

export interface EvidenceInput {
  evidenceType: "PROOF_OF_FULFILLMENT" | "OTHER";
  notes: string;
  file: { name: string; bytes: Uint8Array; contentType: string };
}

export interface WebhookHeaders {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
}

export interface WebhookEvent {
  id: string;
  event_type: string;
  resource_type?: string;
  resource: Record<string, unknown>;
  create_time?: string;
  summary?: string;
}
