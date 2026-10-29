// Flows A and B: create the job, freeze the scope, and authorize the hold.

import { randomUUID } from "node:crypto";
import {
  Acceptance,
  isJobCategory,
  parseProofSpec,
  ProofType,
  fromPayPalValue,
  nextJobStatus,
  scopeHash,
  sum,
} from "@trace/core";
import * as store from "@trace/db";
import { authorizationOf } from "@trace/paypal";
import type { Engine } from "./deps.ts";
import type { ScopeFlag } from "./inject/text-scan.ts";
import { guardedVoid } from "./guard/execute.ts";
import { DEMO_REVIEW_WINDOW_S, HONOR_PERIOD_DAYS } from "./deps.ts";
import { badRequest, conflict, EngineError, forbidden } from "./errors.ts";
import { payeeForJob } from "./payee.ts";

export const MAX_LINES = 8;
export const MAX_JOB_CENTS = 10_000_00;

export async function createJob(
  e: Engine,
  input: {
    tradesId: string;
    homeownerEmail: string;
    address: string;
    currency?: string;
    deviceId?: string | null;
    demo?: boolean;
    homeownerId?: string | null;
    category?: string;
  },
): Promise<store.JobRow> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.homeownerEmail)) throw badRequest("bad_email", "the client's email is not valid");
  if (!input.address.trim()) throw badRequest("bad_address", "address is required");
  if (input.category !== undefined && !isJobCategory(input.category)) throw badRequest("bad_category", "that job type isn't one Trace takes");
  return e.db.tx(async (q) => {
    const job = await store.insertJob(q, {
      ...input,
      address: input.address.trim(),
      category: isJobCategory(input.category) ? input.category : undefined,
      reviewWindowS: e.settings.demoMode ? DEMO_REVIEW_WINDOW_S : undefined,
    });
    await store.appendEvent(q, { jobId: job.id, actor: "tradesperson", type: "JOB_CREATED", data: { address: job.address, category: job.category } });
    return job;
  });
}

/** The homeowner opens the job link signed in with the email the job was sent to. */
export async function claimJob(e: Engine, jobId: string, user: { id: string; email: string }): Promise<store.JobRow> {
  return e.db.tx(async (q) => {
    const job = await store.mustGetJob(q, jobId, { lock: true });
    if (job.homeowner_id === user.id) return job;
    if (job.homeowner_id) throw forbidden("this job already has a homeowner");
    if (job.homeowner_email !== user.email.toLowerCase()) throw forbidden("this job was sent to a different email");
    if (job.trades_id === user.id && !job.demo) throw forbidden("the tradesperson can't also be the homeowner");
    const out = await store.updateJob(q, jobId, { homeowner_id: user.id });
    await store.appendEvent(q, { jobId, actor: "homeowner", type: "HOMEOWNER_JOINED" });
    return out;
  });
}

export interface ScopeLineInput {
  code: string;
  title: string;
  description?: string | null;
  priceCents: number;
  acceptance: unknown;
  verifiableByPhoto: boolean;
  /** How the line is proved; photo when absent. */
  proofType?: string;
  proofSpec?: unknown;
}

/** Save the edited lines on a draft job. */
export async function saveScope(e: Engine, jobId: string, tradesId: string, lines: ScopeLineInput[]): Promise<store.LineRow[]> {
  if (lines.length === 0 || lines.length > MAX_LINES) throw badRequest("bad_scope", `a scope has 1 to ${MAX_LINES} lines`);
  const codes = new Set<string>();
  const clean = lines.map((l) => {
    if (!Number.isSafeInteger(l.priceCents) || l.priceCents <= 0) throw badRequest("bad_price", `${l.code}: price must be a positive number of cents`);
    if (!l.title.trim()) throw badRequest("bad_title", `${l.code}: title is required`);
    if (codes.has(l.code)) throw badRequest("bad_scope", `duplicate line code ${l.code}`);
    codes.add(l.code);
    const acceptance = Acceptance.safeParse(l.acceptance);
    if (!acceptance.success) throw badRequest("bad_acceptance", `${l.code}: acceptance is not valid`);
    const type = ProofType.safeParse(l.proofType ?? "photo");
    if (!type.success) throw badRequest("bad_proof_type", `${l.code}: that proof type isn't one Trace checks`);
    const spec = parseProofSpec(type.data, l.proofSpec);
    if (!spec.ok) throw badRequest("bad_proof_spec", `${l.code}: ${spec.error}`);
    return {
      ...l,
      title: l.title.trim(),
      acceptance: acceptance.data,
      proofType: type.data,
      proofSpec: spec.spec,
      // Only a photo is judged against a before-photo; the other types carry their own proof.
      verifiableByPhoto: type.data === "photo" ? l.verifiableByPhoto : false,
    };
  });
  if (sum(clean.map((l) => l.priceCents)) > MAX_JOB_CENTS) throw badRequest("bad_scope", "a job is capped at $10,000");
  return e.db.tx(async (q) => {
    const job = await store.mustGetJob(q, jobId, { lock: true });
    if (job.trades_id !== tradesId) throw forbidden();
    if (job.status !== "DRAFT") throw conflict("scope_frozen", "the scope is frozen once it's sent; use a change order");
    return store.replaceLines(q, jobId, clean);
  });
}

/** Send the scope: hash and freeze it. DRAFT -> AWAITING_APPROVAL. */
export async function sendScope(e: Engine, jobId: string, tradesId: string): Promise<store.JobRow> {
  const flags = await checkScope(e, jobId);
  return e.db.tx(async (q) => {
    const job = await store.mustGetJob(q, jobId, { lock: true });
    if (job.trades_id !== tradesId) throw forbidden();
    const lines = await store.getLines(q, jobId);
    if (lines.length === 0) throw conflict("empty_scope", "add at least one line first");
    // A scope the homeowner can't pay is never sent: the money needs somewhere to land.
    await payeeForJob(q, job).catch(() => {
      throw conflict("payee_not_ready", "Connect your PayPal in Settings before sending. That's where the money for this job goes.");
    });
    const hash = scopeHash({
      jobId,
      currency: job.currency,
      lines: lines.map((l) => ({
        code: l.code,
        title: l.title,
        priceCents: l.price_cents,
        acceptance: l.acceptance,
        verifiableByPhoto: l.verifiable_by_photo,
        proofType: l.proof_type,
        proofSpec: l.proof_spec,
      })),
    });
    // Flags only count for lines that still read as they did when checked.
    const current = flags?.filter((f) => lines.some((l) => l.code === f.line && l.title === f.title));
    const out = await store.updateJob(q, jobId, {
      status: nextJobStatus(job.status, "SCOPE_SENT"),
      scope_hash: hash,
      scope_flags: current ? current.map(({ line, text, why }) => ({ line, text, why })) : null,
    });
    await store.appendEvent(q, {
      jobId,
      actor: "tradesperson",
      type: "SCOPE_SENT",
      data: { scope_hash: hash, total_cents: sum(lines.map((l) => l.price_cents)), lines: lines.length },
    });
    return out;
  });
}

/** The homeowner's PayPal button asks for an order. Amounts come from the stored lines only. */
export async function createOrder(e: Engine, jobId: string, homeownerId: string): Promise<{ orderId: string }> {
  const { job, lines, payee } = await e.db.tx(async (q) => {
    const job = await store.mustGetJob(q, jobId);
    if (job.homeowner_id !== homeownerId) throw forbidden();
    if (job.status !== "AWAITING_APPROVAL" || !job.scope_hash) throw conflict("not_awaiting_approval", "this job isn't waiting for approval");
    return { job, lines: await store.getLines(q, jobId), payee: await payeeForJob(q, job) };
  });
  // Same job, scope and payee -> same request ID -> PayPal hands back the same order.
  const order = await e.paypal.createOrder(
    {
      currency: job.currency,
      invoiceId: job.id,
      customId: job.scope_hash!,
      description: `Trace job: ${job.address}`,
      items: lines.map((l) => ({ code: l.code, title: l.title, priceCents: l.price_cents })),
      brandName: e.settings.brandName,
      payeeMerchantId: payee,
    },
    `order-${job.id}-${job.scope_hash!.slice(0, 16)}${payee ? `-${payee}` : ""}`,
  );
  await e.db.tx(async (q) => {
    await store.updateJob(q, jobId, { paypal_order_id: order.id, payee_merchant_id: payee });
    await store.appendEvent(q, { jobId, actor: "homeowner", type: "ORDER_CREATED", data: { order_id: order.id, payee: payee ? "tradesperson" : "platform" } });
  });
  return { orderId: order.id };
}

/**
 * The homeowner approved in PayPal's window: authorize the order and record the
 * hold. AWAITING_APPROVAL -> AUTHORIZED. Safe to call twice.
 */
export async function authorizeJob(e: Engine, jobId: string, orderId: string, homeownerId: string): Promise<store.AuthorizationRow> {
  const job = await store.mustGetJob(e.db, jobId);
  if (job.homeowner_id !== homeownerId) throw forbidden();
  if (job.paypal_order_id !== orderId) throw badRequest("wrong_order", "that order doesn't belong to this job");
  const existing = await store.getBaseAuthorization(e.db, jobId);
  if (existing) return existing;
  if (job.status !== "AWAITING_APPROVAL") throw conflict("not_awaiting_approval", "this job isn't waiting for approval");

  const order = await e.paypal.authorizeOrder(orderId, `authorize-${orderId}`);
  const auth = authorizationOf(order);
  const lines = await store.getLines(e.db, jobId);
  const expected = sum(lines.map((l) => l.price_cents));
  const got = auth.amount ? fromPayPalValue(auth.amount.value) : -1;
  const payee = order.purchase_units?.[0]?.payee?.merchant_id ?? null;
  const wrongPayee = !!job.payee_merchant_id && payee !== null && payee !== job.payee_merchant_id;
  if (wrongPayee || got !== expected || auth.amount?.currency_code !== job.currency || (auth.custom_id !== undefined && auth.custom_id !== job.scope_hash)) {
    // The hold doesn't match the frozen scope. Release it rather than keep a wrong one.
    await guardedVoid(e, jobId, { kind: "worker" }, { paypalAuthId: auth.id }, { requestId: `void-mismatch-${auth.id}` }).catch((err) =>
      e.log.error("void after mismatch failed", { err: String(err) }),
    );
    if (wrongPayee) throw new EngineError("payee_mismatch", "PayPal's order pays a different account than this job's tradesperson", 502);
    throw new EngineError("amount_mismatch", `PayPal authorized ${got} ${auth.amount?.currency_code}, expected ${expected} ${job.currency}`, 502);
  }
  if (auth.status !== "CREATED") throw new EngineError("authorization_not_created", `PayPal returned an authorization in status ${auth.status}`, 502);

  const created = auth.create_time ? new Date(auth.create_time) : e.now();
  return e.db.tx(async (q) => {
    const locked = await store.mustGetJob(q, jobId, { lock: true });
    const again = await store.getBaseAuthorization(q, jobId);
    if (again) return again;
    const row = await store.insertAuthorization(q, {
      jobId,
      orderId,
      authId: auth.id,
      amountCents: got,
      currency: job.currency,
      status: "CREATED",
      honorUntil: new Date(created.getTime() + HONOR_PERIOD_DAYS * 86_400_000),
      expiresAt: auth.expiration_time ? new Date(auth.expiration_time) : null,
    });
    await store.updateJob(q, jobId, { status: nextJobStatus(locked.status, "AUTHORIZED") });
    await store.appendEvent(q, {
      jobId,
      actor: "paypal",
      type: "AUTHORIZED",
      data: { authorization_id: auth.id, amount_cents: got, expires_at: auth.expiration_time ?? null },
    });
    return row;
  });
}

export function newRequestId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

/**
 * Scope-time check (Tripwire section 7): instructions aimed at the AI in the
 * lines are flagged for the homeowner to see beside them. Null when the check
 * couldn't run; sending isn't held up for it.
 */
async function checkScope(e: Engine, jobId: string): Promise<(ScopeFlag & { title: string })[] | null> {
  if (!e.scanner) return null;
  const lines = await store.getLines(e.db, jobId);
  if (lines.length === 0) return null;
  try {
    const flags = await e.scanner.scanScope(lines.map((l) => ({ code: l.code, title: l.title, acceptance: l.acceptance })));
    return flags.map((f) => ({ ...f, title: lines.find((l) => l.code === f.line)!.title }));
  } catch (err) {
    e.log.warn("scope check failed", { job: jobId, err: String(err) });
    return null;
  }
}
