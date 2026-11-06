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
import { releaseUnusedHold } from "./holds.ts";
import { checkScope, cleanLines, MAX_JOB_CENTS, MAX_LINES, type ScopeLineInput } from "./jobs.ts";
import { spendBudget } from "./budget.ts";
import { payeeForJob, payeeOfOrder } from "./payee.ts";

const HELD = ["AUTHORIZED", "IN_PROGRESS", "PARTIALLY_RELEASED"];

/** The tradesperson proposes added lines on a held job. Their codes continue the job's (L5, L6, ...). */
export async function proposeChangeOrder(e: Engine, jobId: string, tradesId: string, lines: Omit<ScopeLineInput, "code">[]): Promise<store.ChangeOrderRow> {
  if (lines.length === 0 || lines.length > MAX_LINES) throw badRequest("bad_scope", `a change order has 1 to ${MAX_LINES} lines`);
  // Added lines get the same check as the scope: no text aimed at the AI checker. They go
  // straight to the client's PayPal window, so a flagged line is refused rather than marked.
  const owner = await store.mustGetJob(e.db, jobId);
  if (owner.trades_id !== tradesId) throw forbidden();
  if (e.scanner) {
    const draft = cleanLines(lines.map((l, i) => ({ ...l, code: `L${i + 1}` })));
    await spendBudget(e, tradesId, "scope_check", { guest: owner.demo });
    const flags = await checkScope(e, draft.map((l) => ({ code: l.code, title: l.title, acceptance: l.acceptance, proof_spec: l.proofSpec ?? null })));
    if (flags?.length) throw new EngineError("scope_flagged", `"${flags[0]!.text.slice(0, 120)}" reads as an instruction to Trace's checker, not part of the work. Reword the line.`, 422);
  }
  return e.db.tx(async (q) => {
    const job = await store.mustGetJob(q, jobId, { lock: true });
    if (job.trades_id !== tradesId) throw forbidden();
    if (!HELD.includes(job.status)) throw conflict("not_held", "a change order is for a job whose money is already held");
    if (job.disputed) throw conflict("disputed", "nothing can be added while a dispute is open");
    // A demo job is anyone's, guests included: keep it to photo lines, whose
    // proof Trace checks itself, rather than links it would fetch or emails it would send.
    if (job.demo && lines.some((l) => (l.proofType ?? "photo") !== "photo")) throw badRequest("demo_photo_only", "the demo job's added lines are proved with photos");
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

/** A change order adds to a job whose money is held and that isn't closing or disputed. */
function assertOpenForChanges(job: store.JobRow): void {
  if (!HELD.includes(job.status)) throw conflict("not_held", `the job is ${job.status.toLowerCase().replace(/_/g, " ")}, so nothing more can be added`);
  if (job.disputed) throw conflict("disputed", "nothing can be added while a dispute is open");
}

/** The client's PayPal button asks for the change order's own order. Amounts come from its frozen lines only. */
export async function createChangeOrderOrder(e: Engine, changeOrderId: string, homeownerId: string): Promise<{ orderId: string }> {
  const { co, job } = await mustChangeOrder(e, changeOrderId);
  if (job.homeowner_id !== homeownerId) throw forbidden();
  if (co.status !== "AWAITING_APPROVAL") throw conflict("not_awaiting_approval", "this change order isn't waiting for approval");
  assertOpenForChanges(job);
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
  if (co.status === "AUTHORIZED" || co.authorization_id) return co;
  if (co.status !== "AWAITING_APPROVAL") throw conflict("not_awaiting_approval", "this change order isn't waiting for approval");
  assertOpenForChanges(job);

  const order = await e.paypal.authorizeOrder(orderId, `authorize-${orderId}`);
  const auth = authorizationOf(order);
  const got = auth.amount ? fromPayPalValue(auth.amount.value) : -1;
  // A job paid to a tradesperson must come back paying exactly them; no payee at all is a mismatch too.
  const payee = job.payee_merchant_id ? await payeeOfOrder(e, order) : null;
  const wrongPayee = !!job.payee_merchant_id && payee !== job.payee_merchant_id;
  if (wrongPayee || got !== co.total_cents || auth.amount?.currency_code !== job.currency || (auth.custom_id !== undefined && auth.custom_id !== co.scope_hash)) {
    await releaseUnusedHold(e, job.id, { paypalAuthId: auth.id }, "mismatch");
    throw new EngineError(wrongPayee ? "payee_mismatch" : "amount_mismatch", wrongPayee ? "PayPal's order pays a different account" : `PayPal authorized ${got}, expected ${co.total_cents}`, 502);
  }
  // PayPal may hold the payment for review first: record it as pending, and the worker or webhook finishes it.
  const pending = auth.status === "PENDING";
  if (auth.status !== "CREATED" && !pending) throw new EngineError("authorization_not_created", `PayPal returned an authorization in status ${auth.status}`, 502);
  const created = auth.create_time ? new Date(auth.create_time) : e.now();
  const outcome = await e.db.tx(async (q) => {
    const current = await store.mustGetJob(q, job.id, { lock: true });
    const locked = (await store.getChangeOrder(q, co.id, { lock: true }))!;
    if (locked.status === "AUTHORIZED" || locked.authorization_id) return { row: locked };
    // The job closed, or a dispute opened, while PayPal was authorizing: the new hold has nothing to pay for.
    if (locked.status !== "AWAITING_APPROVAL" || !HELD.includes(current.status) || current.disputed) return { stale: locked.status !== "AWAITING_APPROVAL" ? "this change order was withdrawn" : current.disputed ? "a dispute opened" : "the job closed" };
    const row = await store.insertAuthorization(q, {
      jobId: job.id,
      orderId,
      authId: auth.id,
      amountCents: got,
      currency: job.currency,
      status: pending ? "PENDING" : "CREATED",
      honorUntil: pending ? null : new Date(created.getTime() + HONOR_PERIOD_DAYS * 86_400_000),
      expiresAt: auth.expiration_time ? new Date(auth.expiration_time) : null,
      kind: "change_order",
    });
    if (pending) {
      const { rows } = await q.query<store.ChangeOrderRow>("update change_orders set authorization_id = $2, updated_at = now() where id = $1 returning *", [co.id, row.id]);
      await store.appendEvent(q, { jobId: job.id, actor: "paypal", type: "HOLD_PENDING", data: { authorization_id: auth.id, amount_cents: got, change_order: co.code } });
      return { row: rows[0]! };
    }
    const { rows } = await q.query<store.ChangeOrderRow>("update change_orders set status = 'AUTHORIZED', authorization_id = $2, updated_at = now() where id = $1 returning *", [co.id, row.id]);
    await store.appendLines(q, job.id, co.lines, co.id);
    await store.appendEvent(q, {
      jobId: job.id,
      actor: "paypal",
      type: "AUTHORIZED",
      data: { authorization_id: auth.id, amount_cents: got, change_order: co.code, lines: co.lines.map((l) => l.code), expires_at: auth.expiration_time ?? null },
    });
    return { row: rows[0]! };
  });
  if (outcome.row) return outcome.row;
  await releaseUnusedHold(e, job.id, { paypalAuthId: auth.id }, "stale");
  throw conflict("not_held", `${outcome.stale}, so the change order's hold was released`);
}

/** The client declines, or the tradesperson withdraws, a change order that isn't held yet. */
export async function closeChangeOrder(e: Engine, changeOrderId: string, userId: string): Promise<store.ChangeOrderRow> {
  const { co, job } = await mustChangeOrder(e, changeOrderId);
  const side = userId === job.homeowner_id ? "homeowner" : userId === job.trades_id ? "tradesperson" : null;
  if (!side) throw forbidden();
  if (co.status !== "AWAITING_APPROVAL") throw conflict("not_awaiting_approval", "only a change order waiting for approval can be declined or withdrawn");
  if (co.authorization_id) throw conflict("hold_pending", "PayPal is still reviewing this change order's payment; it can be withdrawn once PayPal answers");
  const status = side === "homeowner" ? "DECLINED" : "CANCELLED";
  const { rows } = await e.db.query<store.ChangeOrderRow>("update change_orders set status = $2, updated_at = now() where id = $1 returning *", [co.id, status]);
  await store.appendEvent(e.db, { jobId: job.id, actor: side, type: side === "homeowner" ? "CHANGE_ORDER_DECLINED" : "CHANGE_ORDER_WITHDRAWN", data: { change_order: co.code } });
  return rows[0]!;
}
