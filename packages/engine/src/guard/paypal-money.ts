// The money client. These are the only calls in Trace that move money at
// PayPal, and only guard/execute.ts may import this file (a test enforces it).
// Read-only calls (show authorization, list disputes, get order) stay on the
// engine's PayPal client.

import type { Authorization, Capture, CaptureInput, EvidenceInput, Refund } from "@trace/paypal";
import type { Engine } from "../deps.ts";

export function moneyCapture(e: Engine, paypalAuthId: string, input: CaptureInput, requestId: string): Promise<Capture> {
  return e.paypal.captureAuthorization(paypalAuthId, input, requestId);
}

export function moneyVoid(e: Engine, paypalAuthId: string, requestId: string): Promise<void> {
  return e.paypal.voidAuthorization(paypalAuthId, requestId);
}

export function moneyReauthorize(e: Engine, paypalAuthId: string, amount: { cents: number; currency: string }, requestId: string): Promise<Authorization> {
  return e.paypal.reauthorize(paypalAuthId, amount, requestId);
}

// Refunds and evidence act on the payee's own PayPal account (`seller`).

export function moneyRefund(
  e: Engine,
  paypalCaptureId: string,
  amount: { cents: number; currency: string } | null,
  requestId: string,
  seller: string | null,
): Promise<Refund> {
  return e.paypal.refundCapture(paypalCaptureId, amount, requestId, seller);
}

export function moneyFileEvidence(e: Engine, disputeId: string, evidence: EvidenceInput, seller: string | null): Promise<void> {
  return e.paypal.provideEvidence(disputeId, evidence, seller);
}
