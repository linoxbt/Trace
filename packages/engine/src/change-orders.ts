// Change orders (spec section 5): work added after the money is held. The
// original authorization is frozen, so added lines get their own PayPal order
// and authorization, approved by the client the same way. Until then they wait
// on the change order; once held, they join the job's lines and are proved,
// approved and captured like any other, from their own hold.

import { fromPayPalValue, scopeHash, sum } from "@trace/core";
import * as store from "@trace/db";
import { authorizationOf } from "@trace/paypal";
import type { Engine } from "./deps.ts";
import { HONOR_PERIOD_DAYS } from "./deps.ts";
import { badRequest, conflict, EngineError, forbidden } from "./errors.ts";
import { guardedVoid } from "./guard/execute.ts";
import { cleanLines, MAX_JOB_CENTS, MAX_LINES, type ScopeLineInput } from "./jobs.ts";
import { payeeForJob } from "./payee.ts";

const HELD = ["AUTHORIZED", "IN_PROGRESS", "PARTIALLY_RELEASED"];

/** The tradesperson proposes added lines on a held job. Their codes continue the job's (L5, L6, ...). */
export async function proposeChangeOrder(e: Engine, jobId: string, tradesId: string, lines: Omit<ScopeLineInput, "code">[]): Promise<store.ChangeOrderRow> {
  if (lines.length === 0 || lines.length > MAX_LINES) throw badRequest("bad_scope", `a change order has 1 to ${MAX_LINES} lines`);
  return e.db.tx(async (q) => {
    const job = await store.mustGetJob(q, jobId, { lock: true });
    if (job.trades_id !== tradesId) throw forbidden();
    if (!HELD.includes(job.status)) throw conflict("not_held", "a change order is for a job whose money is already held");
    if (job.disputed) throw conflict("disputed", "nothing can be added while a dispute is open");
    const existing = await store.getLines(q, jobId);
    const pending = (await store.changeOrdersForJob(q, jobId)).filter((c) => c.status === "AWAITING_APPROVAL");
    if (pending.length) throw conflict("change_order_pending", `${pending[0]!.code} is still waiting for the client`);
    const used = new Set(existing.map((l) => l.code));
    let n = existing.length;
    const coded = lines.map((l) => {
      let code: string;
      do code = `L${++n}`;
      while (used.has(code));
      used.add(code);
      return { ...l, code };
    });
    if (existing.length + coded.length > 2 * MAX_LINES) throw badRequest("bad_scope", "a job with its change orders has at most 16 lines");
    const clean = cleanLines(coded);
    const total = sum(clean.map((l) => l.priceCents));
    if (sum(existing.map((l) => l.price_cents)) + total > MAX_JOB_CENTS) throw badRequest("bad_scope", "a job, with its change orders, is capped at $10,000");
    const count = (await store.changeOrdersForJob(q, jobId)).length;
    const code = `CO${count + 1}`;
    const hash = scopeHash({
      jobId: `${jobId}/${code}`,
      currency: job.currency,
      lines: clean.map((l) => ({ code: l.code, title: l.title, priceCents: l.priceCents, acceptance: l.acceptance, verifiableByPhoto: l.verifiableByPhoto, proofType: l.proofType, proofSpec: l.proofSpec })),
    });
    const { rows } = await q.query<store.ChangeOrderRow>(
      "insert into change_orders (job_id, code, lines, total_cents, scope_hash) values ($1, $2, $3, $4, $5) returning *",
      [jobId, code, JSON.stringify(clean), total, hash],
    );
    await store.appendEvent(q, { jobId, actor: "tradesperson", type: "CHANGE_ORDER_SENT", data: { change_order: code, lines: clean.map((l) => l.code), total_cents: total } });
    return rows[0]!;
  });
}

async function mustChangeOrder(e: Engine, id: string) {
  const co = await store.getChangeOrder(e.db, id);
  if (!co) throw new EngineError("not_found", "change order not found", 404);
  return { co, job: await store.mustGetJob(e.db, co.job_id) };
}

/** The client's PayPal button asks for the change order's own order. Amounts come from its frozen lines only. */
export async function createChangeOrderOrder(e: Engine, changeOrderId: string, homeownerId: string): Promise<{ orderId: string }> {
  const { co, job } = await mustChangeOrder(e, changeOrderId);
  if (job.homeowner_id !== homeownerId) throw forbidden();
  if (co.status !== "AWAITING_APPROVAL") throw conflict("not_awaiting_approval", "this change order isn't waiting for approval");
  // The same payee as the job's first order: the frozen one if there is one.
  const payee = job.payee_merchant_id ?? (await payeeForJob(e.db, job));
  const order = await e.paypal.createOrder(
    {
      currency: job.currency,
      invoiceId: `${job.id}-${co.code}`,
      customId: co.scope_hash,
      description: `Trace change order ${co.code}: ${job.address}`,
      items: co.lines.map((l) => ({ code: l.code, title: l.title, priceCents: l.priceCents })),
      brandName: e.settings.brandName,
      payeeMerchantId: payee,
    },
    `order-${job.id}-${co.code}-${co.scope_hash.slice(0, 16)}`,
  );
  await e.db.tx(async (q) => {
    await q.query("update change_orders set paypal_order_id = $2, updated_at = now() where id = $1", [co.id, order.id]);
    await store.appendEvent(q, { jobId: job.id, actor: "homeowner", type: "ORDER_CREATED", data: { order_id: order.id, change_order: co.code } });
  });
  return { orderId: order.id };
}

/** The client approved in PayPal: authorize the change order's order, record its hold, and add its lines. */
export async function authorizeChangeOrder(e: Engine, changeOrderId: string, orderId: string, homeownerId: string): Promise<store.ChangeOrderRow> {
  const { co, job } = await mustChangeOrder(e, changeOrderId);
  if (job.homeowner_id !== homeownerId) throw forbidden();
  if (co.paypal_order_id !== orderId) throw badRequest("wrong_order", "that order doesn't belong to this change order");
  if (co.status === "AUTHORIZED") return co;
  if (co.status !== "AWAITING_APPROVAL") throw conflict("not_awaiting_approval", "this change order isn't waiting for approval");

  const order = await e.paypal.authorizeOrder(orderId, `authorize-${orderId}`);
  const auth = authorizationOf(order);
  const got = auth.amount ? fromPayPalValue(auth.amount.value) : -1;
  const payee = order.purchase_units?.[0]?.payee?.merchant_id ?? null;
  const wrongPayee = !!job.payee_merchant_id && payee !== null && payee !== job.payee_merchant_id;
  if (wrongPayee || got !== co.total_cents || auth.amount?.currency_code !== job.currency) {
    await guardedVoid(e, job.id, { kind: "worker" }, { paypalAuthId: auth.id }, { requestId: `void-mismatch-${auth.id}` }).catch((err) =>
      e.log.error("void after change-order mismatch failed", { err: String(err) }),
    );
    throw new EngineError(wrongPayee ? "payee_mismatch" : "amount_mismatch", wrongPayee ? "PayPal's order pays a different account" : `PayPal authorized ${got}, expected ${co.total_cents}`, 502);
  }
  const created = auth.create_time ? new Date(auth.create_time) : e.now();
  return e.db.tx(async (q) => {
    await store.mustGetJob(q, job.id, { lock: true });
    const locked = (await store.getChangeOrder(q, co.id, { lock: true }))!;
    if (locked.status === "AUTHORIZED") return locked;
    const row = await store.insertAuthorization(q, {
      jobId: job.id,
      orderId,
      authId: auth.id,
      amountCents: got,
      currency: job.currency,
      status: "CREATED",
      honorUntil: new Date(created.getTime() + HONOR_PERIOD_DAYS * 86_400_000),
      expiresAt: auth.expiration_time ? new Date(auth.expiration_time) : null,
      kind: "change_order",
    });
    const { rows } = await q.query<store.ChangeOrderRow>("update change_orders set status = 'AUTHORIZED', authorization_id = $2, updated_at = now() where id = $1 returning *", [co.id, row.id]);
    await store.appendLines(q, job.id, co.lines, co.id);
    await store.appendEvent(q, {
      jobId: job.id,
      actor: "paypal",
      type: "AUTHORIZED",
      data: { authorization_id: auth.id, amount_cents: got, change_order: co.code, lines: co.lines.map((l) => l.code), expires_at: auth.expiration_time ?? null },
    });
    return rows[0]!;
  });
}

/** The client declines, or the tradesperson withdraws, a change order that isn't held yet. */
export async function closeChangeOrder(e: Engine, changeOrderId: string, userId: string): Promise<store.ChangeOrderRow> {
  const { co, job } = await mustChangeOrder(e, changeOrderId);
  const side = userId === job.homeowner_id ? "homeowner" : userId === job.trades_id ? "tradesperson" : null;
  if (!side) throw forbidden();
  if (co.status !== "AWAITING_APPROVAL") throw conflict("not_awaiting_approval", "only a change order waiting for approval can be declined or withdrawn");
  const status = side === "homeowner" ? "DECLINED" : "CANCELLED";
  const { rows } = await e.db.query<store.ChangeOrderRow>("update change_orders set status = $2, updated_at = now() where id = $1 returning *", [co.id, status]);
  await store.appendEvent(e.db, { jobId: job.id, actor: side, type: side === "homeowner" ? "CHANGE_ORDER_DECLINED" : "CHANGE_ORDER_WITHDRAWN", data: { change_order: co.code } });
  return rows[0]!;
}
