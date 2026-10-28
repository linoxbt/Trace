// POST /api/webhooks/paypal: verify, de-duplicate on event ID, route by type
// (spec section 10). API responses stay the source of truth; webhooks
// reconcile them.

import * as store from "@trace/db";
import { webhookHeaders, type Capture, type WebhookEvent } from "@trace/paypal";
import type { Engine } from "./deps.ts";
import { EngineError } from "./errors.ts";
import { settleCapture } from "./money.ts";

export class WebhookRejected extends EngineError {
  constructor(reason: string) {
    super("webhook_rejected", reason, 400);
  }
}

export type WebhookOutcome = { result: "processed" | "duplicate" | "ignored"; type: string; jobId?: string };

export async function handleWebhook(e: Engine, rawBody: string, header: (name: string) => string | null): Promise<WebhookOutcome> {
  const headers = webhookHeaders(header);
  if (!headers) throw new WebhookRejected("missing PayPal signature headers");
  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody) as WebhookEvent;
  } catch {
    throw new WebhookRejected("body is not JSON");
  }
  if (!event?.id || !event.event_type || typeof event.resource !== "object") throw new WebhookRejected("not a PayPal event");
  if (!(await e.paypal.verifyWebhook(headers, rawBody, e.settings.webhookId))) {
    e.log.warn("webhook signature rejected", { event: event.id, type: event.event_type });
    throw new WebhookRejected("signature did not verify");
  }

  const fresh = await e.db.tx((q) => store.claimWebhookEvent(q, { id: event.id, type: event.event_type, payload: event }));
  if (!fresh) return { result: "duplicate", type: event.event_type };
  try {
    const out = await route(e, event);
    await store.finishWebhookEvent(e.db, event.id, null);
    return out;
  } catch (err) {
    // Left unprocessed so PayPal's retry runs it again.
    await store.finishWebhookEvent(e.db, event.id, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

async function route(e: Engine, event: WebhookEvent): Promise<WebhookOutcome> {
  const type = event.event_type;
  const r = event.resource as Record<string, unknown>;
  switch (type) {
    case "PAYMENT.AUTHORIZATION.CREATED":
    case "PAYMENT.AUTHORIZATION.VOIDED": {
      const auth = await store.getAuthorizationByPayPalId(e.db, String(r.id));
      if (!auth) return { result: "ignored", type };
      await e.db.tx(async (q) => {
        await store.appendEvent(q, { jobId: auth.job_id, actor: "paypal", type: type === "PAYMENT.AUTHORIZATION.VOIDED" ? "WEBHOOK_AUTHORIZATION_VOIDED" : "WEBHOOK_AUTHORIZATION_CREATED", data: { authorization_id: auth.paypal_auth_id } });
        if (type === "PAYMENT.AUTHORIZATION.VOIDED" && auth.status !== "VOIDED") {
          await store.updateAuthorization(q, auth.id, { status: "VOIDED" });
          const job = await store.mustGetJob(q, auth.job_id, { lock: true });
          if (["AUTHORIZED", "IN_PROGRESS", "PARTIALLY_RELEASED"].includes(job.status)) {
            await store.updateJob(q, job.id, { status: "CLOSED_VOIDED" });
            await store.appendEvent(q, { jobId: job.id, actor: "paypal", type: "VOIDED", data: { by: "paypal", alert: "both" } });
          }
        }
      });
      return { result: "processed", type, jobId: auth.job_id };
    }

    case "PAYMENT.CAPTURE.COMPLETED":
    case "PAYMENT.CAPTURE.PENDING":
    case "PAYMENT.CAPTURE.DENIED":
    case "PAYMENT.CAPTURE.DECLINED": {
      const pp = r as unknown as Capture;
      const cap = (await store.getCaptureByPayPalId(e.db, pp.id)) ?? (pp.invoice_id ? await store.getCaptureByInvoiceId(e.db, pp.invoice_id) : null);
      if (!cap) return { result: "ignored", type };
      const status = type.endsWith("COMPLETED") ? "COMPLETED" : type.endsWith("PENDING") ? "PENDING" : "DECLINED";
      await settleCapture(e, cap.id, { ...pp, status });
      const jobId = (await e.db.query<{ job_id: string }>("select job_id from authorizations where id = $1", [cap.authorization_id])).rows[0]?.job_id;
      return { result: "processed", type, jobId };
    }

    case "PAYMENT.CAPTURE.REFUNDED": {
      // The refund resource links back to the capture it refunds.
      const links = (r.links as { rel: string; href: string }[] | undefined) ?? [];
      const up = links.find((l) => l.rel === "up")?.href ?? "";
      const captureId = up.split("/").pop() ?? "";
      const cap = captureId ? await store.getCaptureByPayPalId(e.db, captureId) : null;
      if (!cap) return { result: "ignored", type };
      const jobId = await e.db.tx(async (q) => {
        const auth = (await q.query<store.AuthorizationRow>("select * from authorizations where id = $1", [cap.authorization_id])).rows[0]!;
        await store.updateCapture(q, cap.id, { status: "REFUNDED" });
        await store.appendEvent(q, { jobId: auth.job_id, actor: "paypal", type: "REFUNDED", data: { capture: cap.id, paypal_capture_id: captureId, amount: r.amount ?? null } });
        return auth.job_id;
      });
      return { result: "processed", type, jobId };
    }

    case "CUSTOMER.DISPUTE.CREATED":
    case "CUSTOMER.DISPUTE.UPDATED":
    case "CUSTOMER.DISPUTE.RESOLVED": {
      const txns = (r.disputed_transactions as { seller_transaction_id?: string }[] | undefined) ?? [];
      let cap: store.CaptureRow | null = null;
      for (const t of txns) {
        if (t.seller_transaction_id) cap = await store.getCaptureByPayPalId(e.db, t.seller_transaction_id);
        if (cap) break;
      }
      if (!cap) return { result: "ignored", type };
      const jobId = await e.db.tx(async (q) => {
        const auth = (await q.query<store.AuthorizationRow>("select * from authorizations where id = $1", [cap.authorization_id])).rows[0]!;
        const { row, created } = await store.upsertDispute(q, {
          jobId: auth.job_id,
          captureId: cap.id,
          paypalDisputeId: String(r.dispute_id),
          reason: (r.reason as string | undefined) ?? null,
          status: (r.status as string | undefined) ?? null,
        });
        if (created) await store.updateJob(q, auth.job_id, { disputed: true });
        await store.appendEvent(q, {
          jobId: auth.job_id,
          actor: "paypal",
          type: type === "CUSTOMER.DISPUTE.CREATED" ? "DISPUTE_OPENED" : type === "CUSTOMER.DISPUTE.RESOLVED" ? "DISPUTE_RESOLVED" : "DISPUTE_UPDATED",
          data: { dispute: row.paypal_dispute_id, reason: row.reason, status: row.status, ...(created ? { draft: "queued", notify: "tradesperson" } : {}) },
        });
        return auth.job_id;
      });
      return { result: "processed", type, jobId };
    }

    case "CHECKOUT.ORDER.APPROVED": {
      const job = await store.getJobByOrderId(e.db, String(r.id));
      if (!job) return { result: "ignored", type };
      await store.appendEvent(e.db, { jobId: job.id, actor: "paypal", type: "ORDER_APPROVED", data: { order_id: r.id } });
      return { result: "processed", type, jobId: job.id };
    }

    default:
      return { result: "ignored", type };
  }
}
