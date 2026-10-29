// Tripwire's single choke point (add-on spec sections 2 and 4). Every PayPal
// call that moves money in Trace goes through here, in the same order:
//   1. validate the action, with the amount recomputed on the server
//   2. pre-flight: live facts from PayPal and the database
//   3. provenance: the trust trail behind the action
//   4. rules: built-in, then presets and people's own rules
//   5. write the decision to the ledger, then act, ask, or refuse.
// Code makes the allow or deny call. Models never do.

import { randomUUID } from "node:crypto";
import {
  CAPTURE_TYPES,
  evaluate,
  isResolvedLine,
  MoneyAction,
  PRESET_RULES,
  plainReasons,
  releasableLines,
  sum,
  type Decision,
  type Evaluation,
  type InitiatorKind,
  type MoneyActionType,
  type Rule,
} from "@trace/core";
import * as store from "@trace/db";
import { isRetryable, PayPalError, type Capture, type EvidenceInput } from "@trace/paypal";
import type { Engine } from "../deps.ts";
import { conflict, EngineError, forbidden } from "../errors.ts";
// money.ts and this file call each other (functions only, never at load time):
// money.ts owns the records, this file owns every money call.
import { failCapture, findCaptureOnOrder, moneyLines, noteToPayer, recordReauthorized, recordVoid, reserveExactCapture, settleCapture, settledResult, type ReleaseResult } from "../money.ts";
import { moneyCapture, moneyFileEvidence, moneyRefund, moneyReauthorize, moneyVoid } from "./paypal-money.ts";
import { FactsUnavailable, gatherFacts, unknownFacts } from "./preflight.ts";
import { buildProvenance } from "./provenance.ts";

export const APPROVAL_TTL_MS = 24 * 3600_000;
export const DEMO_APPROVAL_TTL_MS = 5 * 60_000;

export interface Initiator {
  kind: InitiatorKind;
  userId?: string;
  deviceId?: string;
}

export type GuardVerdict =
  | { outcome: "ALLOW"; decisionId: number; reasons: string[] }
  | { outcome: "REQUIRE_APPROVAL"; decisionId: number; reasons: string[]; approvalId: string }
  | { outcome: "DENY"; decisionId: number; reasons: string[] };

// ---------- rules in force for a job ----------

/** Presets (unless the homeowner turned one off), both parties' account rules, and the job's own rules. */
export async function rulesForJob(e: Engine, job: store.JobRow): Promise<Rule[]> {
  const owners = [job.trades_id, ...(job.homeowner_id ? [job.homeowner_id] : [])];
  const rows = await store.rulesForOwners(e.db, owners, job.id);
  const off = new Set(rows.filter((r) => r.preset && !r.enabled && r.owner_id === job.homeowner_id).map((r) => r.preset));
  const presets = job.homeowner_id ? PRESET_RULES.filter((p) => !off.has(p.id)) : [];
  // An account rule follows its owner's side on this job: a homeowner rule from
  // someone who is the tradesperson here doesn't apply.
  const sideOf = (r: store.RuleRow) => (r.owner_kind === "homeowner" ? job.homeowner_id : job.trades_id) === r.owner_id;
  const own = rows.filter((r) => r.rule && r.enabled && sideOf(r)).map((r) => ({ ...r.rule!, id: r.id }));
  return [...presets, ...own];
}

// ---------- decide ----------

/** Run checks 1 to 5. The decision is in the ledger before this returns. */
export async function decide(e: Engine, input: MoneyAction): Promise<GuardVerdict> {
  const action = MoneyAction.parse(input);
  const job = await store.mustGetJob(e.db, action.job_id);
  const { injection } = await buildProvenance(e, job.id, action.line_ids, action.provenance.approval_event_ids);

  let facts;
  let ev: Evaluation;
  try {
    facts = await gatherFacts(e, action);
    ev = evaluate(action, facts, await rulesForJob(e, job));
  } catch (err) {
    if (!(err instanceof FactsUnavailable)) throw err;
    e.log.warn("guard: facts unavailable", { job: job.id, request: action.request_id, err: err.message });
    facts = unknownFacts();
    ev = { outcome: "DENY", hits: [{ rule_id: "PREFLIGHT", effect: "deny", why: "PayPal didn't respond, so nothing was moved; try again" }] };
  }

  const decision: Decision = {
    request_id: action.request_id,
    outcome: ev.outcome,
    rule_hits: ev.hits,
    facts,
    injection,
    ...(ev.approver ? { approver: ev.approver } : {}),
    reasons_plain: ev.hits.some((h) => h.rule_id === "PREFLIGHT") ? ["PayPal didn't respond, so nothing was moved. Try again."] : plainReasons(action, facts, ev),
    decided_at: e.now().toISOString(),
  };

  return e.db.tx(async (q) => {
    const row = await store.insertDecision(q, action, decision);
    const base = { decision: row.id, request_id: action.request_id, action: action.type, amount_cents: action.amount_cents, reasons: decision.reasons_plain };
    if (ev.outcome === "ALLOW") {
      await store.appendEvent(q, { jobId: job.id, actor: "system", type: "GUARD_ALLOWED", data: base });
      return { outcome: "ALLOW", decisionId: row.id, reasons: decision.reasons_plain };
    }
    if (ev.outcome === "DENY") {
      await store.appendEvent(q, { jobId: job.id, actor: "system", type: "GUARD_BLOCKED", data: { ...base, alert: "both" } });
      return { outcome: "DENY", decisionId: row.id, reasons: decision.reasons_plain };
    }
    const ttl = e.settings.demoMode ? DEMO_APPROVAL_TTL_MS : APPROVAL_TTL_MS;
    const approval = await store.insertApproval(q, { decisionId: row.id, jobId: job.id, approver: ev.approver ?? "homeowner", expiresAt: new Date(e.now().getTime() + ttl) });
    await store.appendEvent(q, {
      jobId: job.id,
      actor: "system",
      type: "GUARD_APPROVAL_NEEDED",
      data: { ...base, approval: approval.id, approver: approval.approver, expires_at: approval.expires_at.toISOString(), notify: approval.approver === "both" ? "both" : approval.approver },
    });
    return { outcome: "REQUIRE_APPROVAL", decisionId: row.id, reasons: decision.reasons_plain, approvalId: approval.id };
  });
}

function action(
  type: MoneyActionType,
  job: store.JobRow,
  init: Initiator,
  provenance: MoneyAction["provenance"],
  rest: Partial<MoneyAction> & { line_ids?: string[]; amount_cents?: number },
): MoneyAction {
  // Undefined options are dropped, so they never overwrite a default.
  const given = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as Partial<MoneyAction>;
  return {
    type,
    job_id: job.id,
    line_ids: [],
    amount_cents: 0,
    initiator: { kind: init.kind, ...(init.userId ? { user_id: init.userId } : {}), ...(init.deviceId ? { device_id: init.deviceId } : {}) },
    provenance,
    ...given,
    request_id: given.request_id ?? `${type.toLowerCase().replace("_", "-")}-${randomUUID()}`,
  };
}

// ---------- captures ----------

const RELEASABLE_JOB = ["AUTHORIZED", "IN_PROGRESS", "PARTIALLY_RELEASED"];

/**
 * Release approved lines through the guard. With `lineIds` (an approval
 * re-run) exactly those lines are proposed; otherwise every approved line not
 * yet reserved. Nothing is reserved or sent unless the guard allows it.
 */
export async function guardedCapture(
  e: Engine,
  jobId: string,
  init: Initiator,
  opts: { final?: boolean; lineIds?: string[]; requestId?: string; approvalEventIds?: number[] } = {},
): Promise<ReleaseResult> {
  const job = await store.mustGetJob(e.db, jobId);
  if (!RELEASABLE_JOB.includes(job.status)) throw conflict("not_releasable", `nothing can be released while the job is ${job.status}`);
  const auth = await store.getBaseAuthorization(e.db, jobId);
  if (!auth) throw conflict("no_hold", "there is no open hold on this job");
  const lines = await store.getLines(e.db, jobId);
  const take = opts.lineIds ? lines.filter((l) => opts.lineIds!.includes(l.id)) : releasableLines(moneyLines(lines)).map((m) => lines.find((l) => l.id === m.id)!);
  if (take.length === 0) return { kind: "nothing" };
  const ids = take.map((l) => l.id);
  const final = !!opts.final || lines.every((l) => ids.includes(l.id) || isResolvedLine(l.status));
  const { provenance } = await buildProvenance(e, jobId, ids, opts.approvalEventIds ?? []);
  const a = action(final ? "FINAL_CAPTURE" : "CAPTURE", job, init, provenance, {
    request_id: opts.requestId,
    authorization_id: auth.id,
    paypal_authorization_id: auth.paypal_auth_id,
    line_ids: ids,
    amount_cents: sum(take.map((l) => l.price_cents)),
    final,
  });

  const verdict = await decide(e, a);
  if (verdict.outcome === "DENY") return { kind: "blocked", reasons: verdict.reasons, decisionId: verdict.decisionId };
  if (verdict.outcome === "REQUIRE_APPROVAL") return { kind: "needs_approval", approvalId: verdict.approvalId, reasons: verdict.reasons, decisionId: verdict.decisionId };

  // Allowed: reserve exactly what was decided. If the lines moved since, nothing is sent.
  let cap: store.CaptureRow;
  try {
    cap = await e.db.tx((q) =>
      reserveExactCapture(q, jobId, { requestId: a.request_id, lineIds: ids, amountCents: a.amount_cents, final, actor: init.kind === "homeowner" ? "homeowner" : init.kind === "tradesperson" ? "tradesperson" : "system" }),
    );
  } catch (err) {
    await store.markDecisionExecuted(e.db, verdict.decisionId, { error: err instanceof Error ? err.message : String(err) });
    // Another release took these lines between the decision and the reservation: nothing left to do.
    if (err instanceof EngineError && err.code === "lines_changed") return { kind: "nothing" };
    throw err;
  }
  return sendCapture(e, cap.id, verdict.decisionId);
}

/** Send a capture that is on record as SENDING. Only an allowed decision for its request id lets it go. */
export async function sendCapture(e: Engine, captureId: string, decisionId?: number): Promise<ReleaseResult> {
  const cap = await store.getCapture(e.db, captureId);
  if (!cap) throw new EngineError("not_found", `capture ${captureId} not found`, 404);
  if (cap.status !== "SENDING") return settledResult(cap);
  const allowed = (await store.decisionsForRequest(e.db, cap.request_id)).find((d) => d.outcome === "ALLOW");
  if (!allowed) return failCapture(e, cap, "no guard decision allows this capture");

  const auth = (await e.db.query<store.AuthorizationRow>("select * from authorizations where id = $1", [cap.authorization_id])).rows[0]!;
  const lines = (await store.getLines(e.db, auth.job_id)).filter((l) => cap.line_ids.includes(l.id));
  await store.updateCapture(e.db, cap.id, { bumpAttempts: true });

  let result: Capture;
  try {
    result = await moneyCapture(
      e,
      auth.paypal_auth_id,
      { amountCents: cap.amount_cents, currency: auth.currency, invoiceId: cap.invoice_id, finalCapture: cap.final, noteToPayer: noteToPayer(lines, auth.currency) },
      cap.request_id,
    );
  } catch (err) {
    if (isRetryable(err)) {
      e.log.warn("capture outcome unknown, will retry", { capture: cap.id, err: String(err) });
      await store.updateCapture(e.db, cap.id, { last_error: String(err) });
      await store.markDecisionExecuted(e.db, decisionId ?? allowed.id, { capture: cap.id, outcome: "unknown" });
      return { kind: "sending", captureId: cap.id, amountCents: cap.amount_cents };
    }
    await store.markDecisionExecuted(e.db, decisionId ?? allowed.id, { capture: cap.id, error: err instanceof Error ? err.message : String(err) });
    if (err instanceof PayPalError && err.has("DUPLICATE_INVOICE_ID")) {
      // Our invoice ID is already on a capture: an earlier attempt landed. Find it on the order.
      const found = await findCaptureOnOrder(e, auth.paypal_order_id, cap.invoice_id);
      if (found) return settleCapture(e, cap.id, found);
    }
    return failCapture(e, cap, err instanceof Error ? err.message : String(err));
  }
  await store.markDecisionExecuted(e.db, decisionId ?? allowed.id, { capture: cap.id, paypal_capture_id: result.id, status: result.status });
  return settleCapture(e, cap.id, result);
}

// ---------- the hold: void and reauthorize ----------

/**
 * Release a hold through the guard. `auth` is our row; without one (a hold
 * refused before it was recorded) pass PayPal's authorization id.
 */
export async function guardedVoid(
  e: Engine,
  jobId: string,
  init: Initiator,
  target: { auth: store.AuthorizationRow } | { paypalAuthId: string },
  opts: { approvalEventIds?: number[]; requestId?: string } = {},
): Promise<GuardVerdict & { voided: boolean }> {
  const job = await store.mustGetJob(e.db, jobId);
  const paypalAuthId = "auth" in target ? target.auth.paypal_auth_id : target.paypalAuthId;
  const { provenance } = await buildProvenance(e, jobId, [], opts.approvalEventIds ?? []);
  const a = action("VOID", job, init, provenance, {
    request_id: opts.requestId ?? `void-${paypalAuthId}`,
    ...("auth" in target ? { authorization_id: target.auth.id } : {}),
    paypal_authorization_id: paypalAuthId,
  });
  const verdict = await decide(e, a);
  if (verdict.outcome !== "ALLOW") return { ...verdict, voided: false };
  try {
    await moneyVoid(e, paypalAuthId, a.request_id);
  } catch (err) {
    if (!(err instanceof PayPalError && err.has("PREVIOUSLY_VOIDED"))) {
      await store.markDecisionExecuted(e.db, verdict.decisionId, { error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }
  await store.markDecisionExecuted(e.db, verdict.decisionId, { voided: paypalAuthId });
  if ("auth" in target) await recordVoid(e, target.auth, init.kind === "worker" ? "system" : init.kind === "homeowner" ? "homeowner" : init.kind === "tradesperson" ? "tradesperson" : "system");
  return { ...verdict, voided: true };
}

/** Renew a hold past its honor period, once, through the guard. */
export async function guardedReauthorize(e: Engine, auth: store.AuthorizationRow): Promise<"reauthorized" | "failed" | "retry" | "blocked"> {
  const job = await store.mustGetJob(e.db, auth.job_id);
  const lines = await store.getLines(e.db, auth.job_id);
  const openCents = sum(lines.filter((l) => !isResolvedLine(l.status)).map((l) => l.price_cents));
  const { provenance } = await buildProvenance(e, job.id, []);
  const a = action("REAUTHORIZE", job, { kind: "worker" }, provenance, {
    request_id: `reauthorize-${auth.paypal_auth_id}`,
    authorization_id: auth.id,
    paypal_authorization_id: auth.paypal_auth_id,
    amount_cents: openCents,
  });
  const verdict = await decide(e, a);
  if (verdict.outcome !== "ALLOW") {
    // A blocked renewal is recorded once, so the worker doesn't ask again every minute.
    if (!verdict.reasons.some((r) => r.startsWith("PayPal didn't respond"))) await store.updateAuthorization(e.db, auth.id, { reauth_attempted_at: e.now() });
    return verdict.reasons.some((r) => r.startsWith("PayPal didn't respond")) ? "retry" : "blocked";
  }
  try {
    const fresh = await moneyReauthorize(e, auth.paypal_auth_id, { cents: openCents, currency: auth.currency }, a.request_id);
    await store.markDecisionExecuted(e.db, verdict.decisionId, { authorization: fresh.id });
    await recordReauthorized(e, auth, fresh, openCents);
    return "reauthorized";
  } catch (err) {
    await store.markDecisionExecuted(e.db, verdict.decisionId, { error: err instanceof Error ? err.message : String(err) });
    if (isRetryable(err)) {
      e.log.warn("reauthorize will retry", { authorization: auth.id, err: String(err) });
      return "retry";
    }
    await e.db.tx(async (q) => {
      await store.updateAuthorization(q, auth.id, { reauth_attempted_at: e.now() });
      await store.appendEvent(q, {
        jobId: auth.job_id,
        actor: "system",
        type: "REAUTHORIZE_FAILED",
        data: { authorization_id: auth.paypal_auth_id, reason: err instanceof Error ? err.message : String(err), alert: "both" },
      });
    });
    return "failed";
  }
}

// ---------- refunds and dispute evidence ----------

/** Refund a capture (all of it, or `amountCents`). Built-in rule B8 always asks both sides first. */
export async function guardedRefund(
  e: Engine,
  jobId: string,
  init: Initiator,
  captureRowId: string,
  opts: { amountCents?: number; approvalEventIds?: number[]; requestId?: string } = {},
): Promise<GuardVerdict & { refunded: boolean }> {
  const job = await store.mustGetJob(e.db, jobId);
  const cap = await store.getCapture(e.db, captureRowId);
  if (!cap || (await store.jobIdOfCapture(e.db, cap.id)) !== jobId) throw new EngineError("not_found", "capture not found", 404);
  if (!cap.paypal_capture_id || cap.status !== "COMPLETED") throw conflict("not_refundable", "only a completed capture can be refunded");
  const amount = opts.amountCents ?? cap.amount_cents;
  if (amount <= 0 || amount > cap.amount_cents) throw new EngineError("bad_amount", "refund must be between $0.01 and the captured amount", 400);
  const { provenance } = await buildProvenance(e, jobId, cap.line_ids, opts.approvalEventIds ?? []);
  const a = action("REFUND", job, init, provenance, {
    request_id: opts.requestId ?? `refund-${cap.id}-${amount}`,
    authorization_id: cap.authorization_id,
    capture_id: cap.id,
    line_ids: cap.line_ids,
    amount_cents: amount,
  });
  const verdict = await decide(e, a);
  if (verdict.outcome !== "ALLOW") return { ...verdict, refunded: false };
  const auth = (await e.db.query<store.AuthorizationRow>("select * from authorizations where id = $1", [cap.authorization_id])).rows[0]!;
  const refund = await moneyRefund(e, cap.paypal_capture_id, { cents: amount, currency: auth.currency }, a.request_id, job.payee_merchant_id);
  await store.markDecisionExecuted(e.db, verdict.decisionId, { refund: refund.id, status: refund.status });
  await e.db.tx(async (q) => {
    await store.mustGetJob(q, jobId, { lock: true });
    await store.updateCapture(q, cap.id, { status: amount === cap.amount_cents ? "REFUNDED" : "PARTIALLY_REFUNDED" });
    await store.appendEvent(q, { jobId, actor: "system", type: "REFUNDED", data: { capture: cap.id, amount_cents: amount, refund: refund.id } });
  });
  return { ...verdict, refunded: true };
}

/** File dispute evidence. Built-in rule B7: only the tradesperson can. */
export async function guardedFileEvidence(e: Engine, jobId: string, init: Initiator, disputeRowId: string, evidence: EvidenceInput): Promise<GuardVerdict & { filed: boolean }> {
  const job = await store.mustGetJob(e.db, jobId);
  const dispute = (await e.db.query<store.DisputeRow>("select * from disputes where id = $1 and job_id = $2", [disputeRowId, jobId])).rows[0];
  if (!dispute) throw new EngineError("not_found", "dispute not found", 404);
  const { provenance } = await buildProvenance(e, jobId, []);
  const a = action("FILE_EVIDENCE", job, init, provenance, { request_id: `evidence-${dispute.paypal_dispute_id}-${randomUUID()}`, dispute_id: dispute.paypal_dispute_id });
  const verdict = await decide(e, a);
  if (verdict.outcome !== "ALLOW") return { ...verdict, filed: false };
  await moneyFileEvidence(e, dispute.paypal_dispute_id, evidence, job.payee_merchant_id);
  await store.markDecisionExecuted(e.db, verdict.decisionId, { filed: dispute.paypal_dispute_id });
  await e.db.tx(async (q) => {
    await q.query("update disputes set filed_at = now(), updated_at = now() where id = $1", [dispute.id]);
    await store.appendEvent(q, { jobId, actor: "tradesperson", type: "EVIDENCE_FILED", data: { dispute: dispute.paypal_dispute_id } });
  });
  return { ...verdict, filed: true };
}

// ---------- approval queue (section 8) ----------

export type ApprovalResult =
  | { kind: "waiting"; for: "homeowner" | "tradesperson" }
  | { kind: "denied" }
  | { kind: "ran"; outcome: string; reasons: string[]; release?: ReleaseResult };

/**
 * Approve or deny a pending request. Approving re-runs the guard on the same
 * frozen action with the approval attached; it is not a bypass, so built-in
 * deny rules still apply. "both" needs one approval from each side.
 */
export async function answerApproval(e: Engine, approvalId: string, userId: string, approve: boolean): Promise<ApprovalResult> {
  const step = await e.db.tx(async (q) => {
    const first = await store.getApproval(q, approvalId);
    if (!first) throw new EngineError("not_found", "approval not found", 404);
    const job = await store.mustGetJob(q, first.job_id, { lock: true });
    const a = (await store.getApproval(q, approvalId, { lock: true }))!;
    const asHome = job.homeowner_id === userId;
    const asTrades = job.trades_id === userId;
    if (!asHome && !asTrades) throw forbidden();
    if (a.status !== "PENDING") throw conflict("approval_closed", `this request is already ${a.status.toLowerCase()}`);
    if (a.expires_at <= e.now()) {
      await store.updateApproval(q, a.id, { status: "EXPIRED" });
      await store.appendEvent(q, { jobId: job.id, actor: "system", type: "GUARD_APPROVAL_EXPIRED", data: { approval: a.id } });
      return { kind: "expired" as const };
    }
    // Judge mode: one person plays both sides, so one tap counts for both.
    const both = job.demo && asHome && asTrades;
    const by: "homeowner" | "tradesperson" | "both" = both ? "both" : a.approver === "tradesperson" ? (asTrades ? "tradesperson" : "homeowner") : asHome ? "homeowner" : "tradesperson";
    const needed = a.approver === "both" ? ["homeowner", "tradesperson"] : [a.approver];
    if (!both && !needed.includes(by)) throw forbidden(`this request is waiting for the ${a.approver}`);
    if (!both && a.approvals.some((x) => x.by === by)) throw conflict("already_approved", "you already approved this; it's waiting for the other side");
    const decision = (await q.query<store.DecisionRow>("select * from guard_decisions where id = $1", [a.decision_id])).rows[0]!;
    const actor = by === "both" ? "homeowner" : by;

    if (!approve) {
      await store.updateApproval(q, a.id, { status: "DENIED" });
      await store.appendEvent(q, { jobId: job.id, actor, type: "GUARD_DENIED", data: { approval: a.id, request_id: decision.request_id, by } });
      return { kind: "denied" as const };
    }
    const eventId = await store.appendEvent(q, { jobId: job.id, actor, type: "GUARD_APPROVED", data: { approval: a.id, request_id: decision.request_id, by } });
    const approvals = [...a.approvals, ...(by === "both" ? (["homeowner", "tradesperson"] as const) : [by]).map((b) => ({ by: b, at: e.now().toISOString(), event_id: eventId }))];
    const have = new Set(approvals.map((x) => x.by));
    const missing = needed.filter((n) => !have.has(n as "homeowner" | "tradesperson"));
    if (missing.length) {
      await store.updateApproval(q, a.id, { approvals });
      return { kind: "waiting" as const, for: missing[0] as "homeowner" | "tradesperson" };
    }
    await store.updateApproval(q, a.id, { approvals, status: "APPROVED" });
    return { kind: "rerun" as const, action: decision.action, eventIds: [...new Set([...decision.action.provenance.approval_event_ids, ...approvals.map((x) => x.event_id)])] };
  });
  // Thrown after the transaction, so the expiry above is kept.
  if (step.kind === "expired") throw conflict("approval_expired", "this request expired; the lines stay approved, so release again");
  if (step.kind !== "rerun") return step;

  // Re-run on the same frozen action, now carrying the approval.
  const a = step.action;
  const init: Initiator = { kind: a.initiator.kind, userId: a.initiator.user_id, deviceId: a.initiator.device_id };
  if (CAPTURE_TYPES.includes(a.type)) {
    const release = await guardedCapture(e, a.job_id, init, { final: a.final, lineIds: a.line_ids, requestId: a.request_id, approvalEventIds: step.eventIds });
    const outcome = release.kind === "blocked" ? "DENY" : release.kind === "needs_approval" ? "REQUIRE_APPROVAL" : "ALLOW";
    return { kind: "ran", outcome, reasons: "reasons" in release ? release.reasons : [], release };
  }
  if (a.type === "VOID") {
    const auth = a.authorization_id ? (await e.db.query<store.AuthorizationRow>("select * from authorizations where id = $1", [a.authorization_id])).rows[0] : undefined;
    const r = await guardedVoid(e, a.job_id, init, auth ? { auth } : { paypalAuthId: a.paypal_authorization_id! }, { approvalEventIds: step.eventIds, requestId: a.request_id });
    return { kind: "ran", outcome: r.outcome, reasons: r.reasons };
  }
  if (a.type === "REFUND") {
    const r = await guardedRefund(e, a.job_id, init, a.capture_id!, { amountCents: a.amount_cents, approvalEventIds: step.eventIds, requestId: a.request_id });
    return { kind: "ran", outcome: r.outcome, reasons: r.reasons };
  }
  throw conflict("not_approvable", `a ${a.type} can't be approved here`);
}

/** Worker: requests nobody answered in time are denied and logged. The lines stay approved for a fresh release. */
export async function expireApprovals(e: Engine): Promise<number> {
  let n = 0;
  for (const a of await store.expiredApprovals(e.db, e.now())) {
    await e.db.tx(async (q) => {
      await store.mustGetJob(q, a.job_id, { lock: true });
      const locked = await store.getApproval(q, a.id, { lock: true });
      if (!locked || locked.status !== "PENDING") return;
      await store.updateApproval(q, a.id, { status: "EXPIRED" });
      await store.appendEvent(q, { jobId: a.job_id, actor: "system", type: "GUARD_APPROVAL_EXPIRED", data: { approval: a.id } });
      n += 1;
    });
  }
  return n;
}

