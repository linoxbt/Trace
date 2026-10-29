// Paying the tradesperson directly. A tradesperson links their own PayPal
// account through Trace's partner sign-up, and every order names them as the
// payee: captured money settles in their PayPal and never passes through
// Trace's. PayPal is asked for the account's state; the return URL's query
// string is never trusted.

import * as store from "@trace/db";
import { PayPalNotPartner } from "@trace/paypal";
import type { Engine } from "./deps.ts";
import { conflict, EngineError } from "./errors.ts";

export type PayeeState = "none" | "pending" | "ready";

export interface PayeeStatus {
  state: PayeeState;
  merchantId: string | null;
  receivable: boolean;
  emailConfirmed: boolean;
  permissions: boolean;
  checkedAt: Date | null;
}

export function payeeStatusOf(row: store.PayeeRow | null): PayeeStatus {
  const merchantId = row?.paypal_merchant_id ?? null;
  const receivable = !!row?.paypal_receivable;
  const emailConfirmed = !!row?.paypal_email_confirmed;
  const permissions = !!row?.paypal_permissions;
  return {
    state: !merchantId ? "none" : receivable && emailConfirmed && permissions ? "ready" : "pending",
    merchantId,
    receivable,
    emailConfirmed,
    permissions,
    checkedAt: row?.paypal_checked_at ?? null,
  };
}

export async function payeeStatus(e: Engine, userId: string): Promise<PayeeStatus> {
  return payeeStatusOf(await store.getPayee(e.db, userId));
}

function partnerError(err: unknown): never {
  if (err instanceof PayPalNotPartner) throw new EngineError("paypal_partner_missing", err.message, 503);
  throw err;
}

/** Start PayPal sign-up for this person. Their profile ID is the tracking ID PayPal hands back. */
export async function startPayeeConnect(e: Engine, userId: string, returnUrl: string): Promise<{ url: string }> {
  const { actionUrl } = await e.paypal.createPartnerReferral({ trackingId: userId, returnUrl }).catch(partnerError);
  return { url: actionUrl };
}

/** Ask PayPal what this person's linked account can do now, and save it. */
export async function refreshPayee(e: Engine, userId: string): Promise<PayeeStatus> {
  const known = await store.getPayee(e.db, userId);
  const merchantId = (await e.paypal.findSeller(userId).catch(partnerError)) ?? known?.paypal_merchant_id ?? null;
  if (!merchantId) return payeeStatusOf(known);
  const s = await e.paypal.sellerStatus(merchantId).catch(partnerError);
  // The account must be the one PayPal signed up under this person's tracking ID.
  if (s.trackingId && s.trackingId !== userId) throw new EngineError("payee_mismatch", "that PayPal account was linked from a different Trace account", 409);
  await store.setPayee(e.db, userId, { merchantId, receivable: s.paymentsReceivable, emailConfirmed: s.emailConfirmed, permissions: s.permissionsGranted });
  e.log.info("payee refreshed", { user: userId, receivable: s.paymentsReceivable, email: s.emailConfirmed, permissions: s.permissionsGranted });
  return payeeStatus(e, userId);
}

/** Unlink. Jobs already held keep paying the account they were approved with. */
export async function disconnectPayee(e: Engine, userId: string): Promise<PayeeStatus> {
  await store.setPayee(e.db, userId, { merchantId: null, receivable: false, emailConfirmed: false, permissions: false });
  return payeeStatus(e, userId);
}

/** The merchant ID a new order pays, or a clear refusal. Demo jobs pay Trace's sandbox account. */
export async function payeeForJob(q: store.Queryable, job: store.JobRow): Promise<string | null> {
  if (job.demo) return null;
  const s = payeeStatusOf(await store.getPayee(q, job.trades_id));
  if (s.state !== "ready") {
    throw conflict(
      "payee_not_ready",
      s.state === "none"
        ? "The tradesperson hasn't connected PayPal yet, so there's nowhere for the money to go."
        : "The tradesperson's PayPal account isn't ready to receive payments yet.",
    );
  }
  return s.merchantId;
}

/** Merchant webhooks: re-read the account from PayPal, or unlink it when consent is withdrawn. */
export async function payeeWebhook(e: Engine, type: string, resource: Record<string, unknown>): Promise<boolean> {
  const merchantId = typeof resource.merchant_id === "string" ? resource.merchant_id : null;
  const tracking = typeof resource.tracking_id === "string" ? resource.tracking_id : null;
  const uuid = (v: string | null | undefined) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
  let userId = (merchantId ? await store.profileIdByMerchant(e.db, merchantId) : null) ?? uuid(tracking);
  // A seller who finished sign-up but never came back: PayPal knows their tracking ID.
  if (!userId && merchantId && type !== "MERCHANT.PARTNER-CONSENT.REVOKED") {
    userId = uuid((await e.paypal.sellerStatus(merchantId).catch(() => null))?.trackingId);
  }
  if (!userId || !(await store.getPayee(e.db, userId))) return false;
  if (type === "MERCHANT.PARTNER-CONSENT.REVOKED") {
    await store.setPayee(e.db, userId, { merchantId: null, receivable: false, emailConfirmed: false, permissions: false });
    e.log.warn("payee consent revoked", { user: userId });
    return true;
  }
  await refreshPayee(e, userId);
  return true;
}
