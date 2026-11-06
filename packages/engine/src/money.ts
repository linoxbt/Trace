// Flow D and the close: the records behind every capture, void and
// reauthorization. The money calls themselves go through the Tripwire guard
// (guard/execute.ts), which decides before anything moves. A capture is put
// on record (SENDING, with its PayPal-Request-Id) only after the guard allows
// it, so a lost response is retried with the same ID and never becomes a
// second capture. Every transaction here locks the job row first, then
// authorization, lines and captures, so two of them on one job queue instead
// of deadlocking.

import { formatMoney, isResolvedLine, nextJobStatus, nextLineStatus, planClose, sum, type JobStatus, type MoneyLine } from "@trace/core";
import * as store from "@trace/db";
import type { Authorization, Capture } from "@trace/paypal";
import type { Queryable } from "@trace/db";
import type { Engine } from "./deps.ts";
import { conflict, EngineError, forbidden } from "./errors.ts";
// The guard and this file call each other (functions only, never at load time).
import { guardedCapture, guardedReauthorize, guardedVoid, sendCapture, type Initiator } from "./guard/execute.ts";

const CAPTURABLE_AUTH: store.AuthorizationStatus[] = ["CREATED", "PARTIALLY_CAPTURED"];
const RELEASABLE_JOB = ["AUTHORIZED", "IN_PROGRESS", "PARTIALLY_RELEASED"];

export type ReleaseResult =
  | { kind: "nothing" }
  | { kind: "captured"; captureId: string; amountCents: number; status: store.CaptureStatus }
  | { kind: "sending"; captureId: string; amountCents: number }
  | { kind: "failed"; captureId: string; amountCents: number; reason: string }
  | { kind: "needs_approval"; approvalId: string; reasons: string[]; decisionId: number }
  | { kind: "blocked"; reasons: string[]; decisionId: number };

export function moneyLines(lines: store.LineRow[]): MoneyLine[] {
  return lines.map((l) => ({ id: l.id, status: l.status, priceCents: l.price_cents, captureRef: l.capture_id }));
}

export function noteToPayer(lines: store.LineRow[], currency: string): string {
  return `Trace: verified work released: ${lines.map((l) => `${l.code} ${l.title} ${formatMoney(l.price_cents, currency)}`).join("; ")}`;
}

/**
 * Reserve exactly the lines and amount the guard allowed, in one locked
 * transaction, and put the capture on record. If anything moved since the
 * decision (a line no longer approved, a different total, too little left on
 * the hold), nothing is reserved.
 */
export async function reserveExactCapture(
  q: Queryable,
  jobId: string,
  want: { requestId: string; lineIds: string[]; amountCents: number; final: boolean; actor: store.Actor; authorizationId?: string },
): Promise<store.CaptureRow> {
  const job = await store.mustGetJob(q, jobId, { lock: true });
  if (!RELEASABLE_JOB.includes(job.status)) throw conflict("not_releasable", `nothing can be released while the job is ${job.status}`);
  const auth = want.authorizationId
    ? (await q.query<store.AuthorizationRow>("select * from authorizations where id = $1 and job_id = $2 for update", [want.authorizationId, jobId])).rows[0]
    : await store.getBaseAuthorization(q, jobId, { lock: true });
  if (!auth || !CAPTURABLE_AUTH.includes(auth.status)) throw conflict("no_hold", "there is no open hold on this job");
  // Only the lines this hold pays for.
  const lines = await store.linesOfAuthorization(q, auth, { lock: true });
  const take = lines.filter((l) => want.lineIds.includes(l.id));
  if (take.length !== want.lineIds.length || take.some((l) => l.status !== "APPROVED" || l.capture_id !== null)) {
    throw conflict("lines_changed", "the lines changed since this release was checked; release again");
  }
  if (sum(take.map((l) => l.price_cents)) !== want.amountCents) throw conflict("amount_mismatch", "the amount doesn't match the lines; release again");
  const captured = await store.capturedCents(q, auth.id);
  if (captured + want.amountCents > auth.amount_cents) throw conflict("over_hold", "that would capture more than is held");
  const n = (await store.countCaptures(q, auth.id)) + 1;
  // Invoice ids are unique at PayPal: a change order's captures carry its code.
  const co = auth.kind === "base" ? null : (await q.query<{ code: string }>("select code from change_orders where authorization_id = $1", [auth.id])).rows[0]?.code;
  const cap = await store.insertCapture(q, {
    authorizationId: auth.id,
    requestId: want.requestId,
    invoiceId: co ? `${jobId}-${co}-r${n}` : `${jobId}-r${n}`,
    amountCents: want.amountCents,
    final: want.final,
    lineIds: want.lineIds,
  });
  for (const id of want.lineIds) await store.updateLine(q, id, { capture_id: cap.id });
  await store.appendEvent(q, {
    jobId,
    actor: want.actor,
    type: "RELEASE_STARTED",
    data: { capture: cap.id, amount_cents: cap.amount_cents, final: cap.final, lines: take.map((l) => l.code) },
  });
  return cap;
}

/**
 * Release every approved line now (homeowner's button, or the worker after a
 * review window), through the guard. Each hold is captured on its own: the
 * original scope from the base authorization, a change order's lines from its.
 */
export async function release(e: Engine, jobId: string, actor: store.Actor = "homeowner", userId?: string): Promise<ReleaseResult> {
  const init: Initiator = actor === "homeowner" ? { kind: "homeowner", userId } : actor === "tradesperson" ? { kind: "tradesperson", userId } : { kind: "worker" };
  const holds = (await store.authorizationsForJob(e.db, jobId)).filter((a) => CAPTURABLE_AUTH.includes(a.status));
  if (holds.length <= 1) return guardedCapture(e, jobId, init, holds[0] ? { authorizationId: holds[0].id } : {});
  let out: ReleaseResult = { kind: "nothing" };
  let problem: ReleaseResult | null = null;
  for (const auth of holds) {
    const r = await guardedCapture(e, jobId, init, { authorizationId: auth.id });
    if (r.kind === "nothing") continue;
    // A hold that needs approval, was blocked or failed doesn't stop the others: they still go, and it is reported.
    if (r.kind !== "captured") {
      problem ??= r;
      continue;
    }
    out = out.kind === "captured" ? { ...r, amountCents: out.amountCents + r.amountCents } : r;
  }
  return problem ?? out;
}

export async function findCaptureOnOrder(e: Engine, orderId: string, invoiceId: string): Promise<Capture | null> {
  const order = await e.paypal.getOrder(orderId);
  return order.purchase_units?.flatMap((u) => u.payments?.captures ?? []).find((c) => c.invoice_id === invoiceId) ?? null;
}

export function settledResult(cap: store.CaptureRow): ReleaseResult {
  if (cap.status === "SENDING") return { kind: "sending", captureId: cap.id, amountCents: cap.amount_cents };
  if (cap.status === "FAILED" || cap.status === "DECLINED") {
    return { kind: "failed", captureId: cap.id, amountCents: cap.amount_cents, reason: cap.last_error ?? cap.status };
  }
  return { kind: "captured", captureId: cap.id, amountCents: cap.amount_cents, status: cap.status };
}

/** PayPal refused the capture: nothing was charged. Its lines go back to releasable. */
export async function failCapture(e: Engine, cap: store.CaptureRow, reason: string): Promise<ReleaseResult> {
  const jobId = await store.jobIdOfCapture(e.db, cap.id);
  const out = await e.db.tx(async (q) => {
    if (jobId) await store.mustGetJob(q, jobId, { lock: true });
    const locked = await store.getCapture(q, cap.id, { lock: true });
    if (!locked || locked.status !== "SENDING") return locked!;
    const failed = await store.updateCapture(q, cap.id, { status: "FAILED", last_error: reason });
    await q.query("update lines set capture_id = null where capture_id = $1", [cap.id]);
    const auth = (await q.query<store.AuthorizationRow>("select * from authorizations where id = $1", [cap.authorization_id])).rows[0]!;
    await store.appendEvent(q, {
      jobId: auth.job_id,
      actor: "paypal",
      type: "CAPTURE_FAILED",
      data: { capture: cap.id, amount_cents: cap.amount_cents, reason, charged: false },
    });
    return failed;
  });
  e.log.warn("capture failed", { capture: cap.id, reason });
  return settledResult(out);
}

/**
 * Record PayPal's answer for one of our captures. Used by the send path, the
 * retry path and the capture webhooks, so it is idempotent.
 */
export async function settleCapture(e: Engine, captureRowId: string, pp: Capture): Promise<ReleaseResult> {
  const jobId = await store.jobIdOfCapture(e.db, captureRowId);
  if (!jobId) throw new EngineError("not_found", `capture ${captureRowId} not found`, 404);
  const settled = await e.db.tx(async (q) => {
    const job = await store.mustGetJob(q, jobId, { lock: true });
    const cap = (await store.getCapture(q, captureRowId, { lock: true }))!;
    // A refunded capture was completed; a late or repeated capture event can't move it back.
    if (cap.status === "REFUNDED" || cap.status === "PARTIALLY_REFUNDED") return cap;
    const auth = (await q.query<store.AuthorizationRow>("select * from authorizations where id = $1 for update", [cap.authorization_id])).rows[0]!;
    const lines = await store.getLines(q, auth.job_id, { lock: true });
    const mine = lines.filter((l) => cap.line_ids.includes(l.id));

    const next: store.CaptureStatus =
      pp.status === "COMPLETED" ? "COMPLETED" : pp.status === "PENDING" ? "PENDING" : pp.status === "DECLINED" ? "DECLINED" : pp.status === "FAILED" ? "FAILED" : cap.status;
    const wasLive = cap.status === "COMPLETED" || cap.status === "PENDING";
    const isLive = next === "COMPLETED" || next === "PENDING";
    const updated = await store.updateCapture(q, cap.id, { status: next, paypal_capture_id: pp.id, last_error: pp.status_details?.reason ?? null });

    if (isLive && !wasLive) {
      for (const l of mine) {
        if (l.status === "APPROVED" && (l.capture_id === null || l.capture_id === cap.id)) {
          await store.updateLine(q, l.id, { status: nextLineStatus(l.status, "CAPTURED"), capture_id: cap.id });
        }
      }
      const after = await store.getLines(q, auth.job_id);
      const allResolved = after.every((l) => isResolvedLine(l.status));
      const captured = await store.capturedCents(q, auth.id);
      // A hold only moves forward: a capture that lands late never reopens a voided or fully captured hold.
      if (auth.status !== "VOIDED" && auth.status !== "CAPTURED") {
        await store.updateAuthorization(q, auth.id, {
          status: cap.final || captured >= auth.amount_cents ? "CAPTURED" : "PARTIALLY_CAPTURED",
        });
      }
      const closed = job.status === "COMPLETED" || job.status === "CLOSED_VOIDED";
      if (!closed) {
        const jobNext = allResolved ? nextJobStatus(job.status, "COMPLETED") : nextJobStatus(job.status, "PARTIAL_RELEASE");
        await store.updateJob(q, job.id, { status: jobNext });
      } else {
        // The job closed while this capture was on its way: money moved, so it isn't "voided", and both sides should know.
        if (job.status === "CLOSED_VOIDED") await store.updateJob(q, job.id, { status: "COMPLETED" });
        await store.appendEvent(q, { jobId: job.id, actor: "system", type: "LATE_CAPTURE", data: { capture: cap.id, amount_cents: cap.amount_cents, alert: "both" } });
      }
      await store.appendEvent(q, {
        jobId: job.id,
        actor: "paypal",
        type: "CAPTURED",
        data: {
          capture: cap.id,
          paypal_capture_id: pp.id,
          status: next,
          amount_cents: cap.amount_cents,
          final: cap.final,
          lines: mine.map((l) => l.code),
          still_held_cents: cap.final ? 0 : auth.amount_cents - captured,
        },
      });
    } else if (!isLive && (next === "DECLINED" || next === "FAILED")) {
      // Denied: nothing charged. Lines that had been marked captured go back to approved.
      for (const l of mine) {
        if (l.status === "CAPTURED") await store.updateLine(q, l.id, { status: nextLineStatus(l.status, "CAPTURE_DENIED"), capture_id: null });
        else if (l.capture_id === cap.id) await store.updateLine(q, l.id, { capture_id: null });
      }
      if (wasLive && auth.status !== "VOIDED") {
        const captured = await store.capturedCents(q, auth.id);
        // Never reopen a hold that was voided, or closed by a final capture other than this one.
        const closedByOther = auth.status === "CAPTURED" && !cap.final;
        if (!closedByOther) await store.updateAuthorization(q, auth.id, { status: captured > 0 ? "PARTIALLY_CAPTURED" : "CREATED" });
        if (job.status === "COMPLETED" || job.status === "PARTIALLY_RELEASED") {
          await store.updateJob(q, job.id, { status: nextJobStatus(job.status, "CAPTURE_REVERSED") });
        }
      }
      await store.appendEvent(q, {
        jobId: job.id,
        actor: "paypal",
        type: "CAPTURE_DENIED",
        data: { capture: cap.id, paypal_capture_id: pp.id, amount_cents: cap.amount_cents, lines: mine.map((l) => l.code), alert: "both" },
      });
    }
    return updated;
  });
  if (settled.status === "COMPLETED" || settled.status === "PENDING") await voidIfDone(e, settled.authorization_id);
  return settledResult(settled);
}

/**
 * Once every line is resolved, release whatever is still held (dropped lines'
 * money) unless a final capture already did. The void goes through the guard.
 */
export async function voidIfDone(e: Engine, authorizationId: string): Promise<boolean> {
  const auth = (await e.db.query<store.AuthorizationRow>("select * from authorizations where id = $1", [authorizationId])).rows[0];
  if (!auth || !CAPTURABLE_AUTH.includes(auth.status)) return false;
  const lines = await store.linesOfAuthorization(e.db, auth);
  if (!lines.every((l) => isResolvedLine(l.status))) return false;
  const inflight = await e.db.query("select 1 from captures where authorization_id = $1 and status = 'SENDING'", [auth.id]);
  if (inflight.rowCount) return false;
  return (await guardedVoid(e, auth.job_id, { kind: "worker" }, { auth })).voided;
}

/**
 * A job has a hold for its scope and one per change order. It closes only
 * once none of them can be captured any more: completed if money moved on
 * any of them, voided if none did. Call it under the job's lock, after a
 * hold changes. Change orders still waiting for the client are withdrawn.
 */
export async function closeJobIfSettled(q: Queryable, jobId: string): Promise<JobStatus> {
  const job = await store.mustGetJob(q, jobId, { lock: true });
  if (!RELEASABLE_JOB.includes(job.status)) return job.status;
  const holds = await store.authorizationsForJob(q, jobId);
  if (holds.some((h) => CAPTURABLE_AUTH.includes(h.status))) return job.status;
  let captured = 0;
  for (const h of holds) captured += await store.capturedCents(q, h.id);
  const status = nextJobStatus(job.status, captured > 0 ? "COMPLETED" : "VOIDED");
  await store.updateJob(q, jobId, { status });
  await cancelPendingChangeOrders(q, jobId);
  return status;
}

/** Withdraw change orders the client hasn't approved: the job they'd add to is closing. */
export async function cancelPendingChangeOrders(q: Queryable, jobId: string): Promise<void> {
  const { rows } = await q.query<{ code: string }>(
    "update change_orders set status = 'CANCELLED', updated_at = now() where job_id = $1 and status = 'AWAITING_APPROVAL' returning code",
    [jobId],
  );
  for (const r of rows) await store.appendEvent(q, { jobId, actor: "system", type: "CHANGE_ORDER_WITHDRAWN", data: { change_order: r.code, reason: "job closed" } });
}

/** Record a void PayPal accepted. The money call itself is the guard's. */
export async function recordVoid(e: Engine, auth: store.AuthorizationRow, actor: store.Actor): Promise<void> {
  await e.db.tx(async (q) => {
    await store.mustGetJob(q, auth.job_id, { lock: true });
    const locked = (await q.query<store.AuthorizationRow>("select * from authorizations where id = $1 for update", [auth.id])).rows[0]!;
    if (locked.status === "VOIDED") return;
    const captured = await store.capturedCents(q, auth.id);
    await store.updateAuthorization(q, auth.id, { status: "VOIDED" });
    await closeJobIfSettled(q, auth.job_id);
    await store.appendEvent(q, {
      jobId: auth.job_id,
      actor,
      type: "VOIDED",
      data: { authorization_id: auth.paypal_auth_id, released_cents: auth.amount_cents - captured },
    });
  });
}

// ---------- review window ----------

/** Open the review window on every proved line that isn't already in one. */
export async function requestRelease(e: Engine, jobId: string, tradesId: string): Promise<{ lines: string[]; dueAt: Date }> {
  return e.db.tx(async (q) => {
    const job = await store.mustGetJob(q, jobId, { lock: true });
    if (job.trades_id !== tradesId) throw forbidden();
    const lines = await store.getLines(q, jobId, { lock: true });
    const ready = lines.filter((l) => (l.status === "VERIFIED" || l.status === "NEEDS_REVIEW") && !l.review_due_at);
    if (!lines.some((l) => l.status === "VERIFIED")) throw conflict("nothing_verified", "release needs at least one verified line");
    const dueAt = new Date(e.now().getTime() + job.review_window_s * 1000);
    for (const l of ready) await store.updateLine(q, l.id, { review_due_at: dueAt });
    await store.appendEvent(q, {
      jobId,
      actor: "tradesperson",
      type: "RELEASE_REQUESTED",
      data: { lines: ready.map((l) => l.code), due_at: dueAt.toISOString(), notify: "homeowner" },
    });
    return { lines: ready.map((l) => l.id), dueAt };
  });
}

/** The homeowner approves or flags one proved line. */
export async function decideLine(
  e: Engine,
  lineId: string,
  homeownerId: string,
  decision: { approve: true } | { approve: false; note: string },
): Promise<store.LineRow> {
  return e.db.tx(async (q) => {
    const line = await store.getLine(q, lineId, { lock: true });
    if (!line) throw new EngineError("not_found", "line not found", 404);
    const job = await store.mustGetJob(q, line.job_id);
    if (job.homeowner_id !== homeownerId) throw forbidden();
    if (decision.approve) {
      const out = await store.updateLine(q, lineId, { status: nextLineStatus(line.status, "APPROVE"), review_due_at: null });
      await store.appendEvent(q, { jobId: job.id, actor: "homeowner", type: "LINE_APPROVED", data: { line: line.code } });
      return out;
    }
    const note = decision.note.trim().slice(0, 500);
    if (!note) throw new EngineError("note_required", "say what's wrong with this line", 400);
    const out = await store.updateLine(q, lineId, { status: nextLineStatus(line.status, "FLAG"), review_due_at: null, flag_note: note });
    const eventId = await store.appendEvent(q, { jobId: job.id, actor: "homeowner", type: "LINE_FLAGGED", data: { line: line.code, note, notify: "tradesperson" } });
    // The note is the homeowner's own words, but it's free text: anything a model reads from it is untrusted.
    await store.labelInput(q, { ref: `note:${eventId}`, jobId: job.id, trust: "untrusted_content" });
    return out;
  });
}

/** Worker: silence approves VERIFIED lines whose window lapsed, then releases their jobs through the guard. */
export async function autoRelease(e: Engine): Promise<{ approved: number; released: ReleaseResult[] }> {
  const lapsed = await store.lapsedVerifiedLines(e.db, e.now());
  const jobs = new Set<string>();
  let approved = 0;
  for (const l of lapsed) {
    const ok = await e.db.tx(async (q) => {
      const line = await store.getLine(q, l.id, { lock: true });
      if (!line || line.status !== "VERIFIED" || !line.review_due_at || line.review_due_at > e.now()) return false;
      await store.updateLine(q, l.id, { status: nextLineStatus(line.status, "AUTO_APPROVE"), review_due_at: null });
      await store.appendEvent(q, { jobId: line.job_id, actor: "system", type: "LINE_AUTO_APPROVED", data: { line: line.code } });
      return true;
    });
    if (ok) {
      approved += 1;
      jobs.add(l.job_id);
    }
  }
  const released: ReleaseResult[] = [];
  for (const jobId of jobs) {
    try {
      released.push(await release(e, jobId, "system"));
    } catch (err) {
      e.log.error("auto release failed", { job: jobId, err: String(err) });
    }
  }
  return { approved, released };
}

/** Worker: resend captures whose outcome is still unknown, with their original request IDs. */
/**
 * Worker: resend captures whose outcome is unknown. A capture counts as stale
 * only well after a send could still be waiting on PayPal (the client gives
 * up after 30 s), and each is claimed atomically before it is resent, so the
 * original request and a resend never race.
 */
export const CAPTURE_STALE_S = 90;

export async function retrySendingCaptures(e: Engine, staleS = CAPTURE_STALE_S): Promise<ReleaseResult[]> {
  const out: ReleaseResult[] = [];
  // Resent as often as is useful and still unknown: ask PayPal's own copy of the order. A capture it
  // has is settled; one it doesn't have never happened (every resend reused its request id), so the
  // lines are freed to release or drop again. If PayPal can't be read either, both sides are told once.
  const { rows: stuck } = await e.db.query<store.CaptureRow & { job_id: string; paypal_order_id: string }>(
    `select c.*, a.job_id, a.paypal_order_id from captures c join authorizations a on a.id = c.authorization_id
      where c.status = 'SENDING' and c.attempts >= $1 and c.updated_at <= now() - make_interval(secs => $2)`,
    [store.MAX_CAPTURE_SENDS, staleS],
  );
  for (const s of stuck) {
    try {
      const found = await findCaptureOnOrder(e, s.paypal_order_id, s.invoice_id);
      out.push(found ? await settleCapture(e, s.id, found) : await failCapture(e, s, "PayPal has no record of this capture after repeated tries; nothing was charged"));
    } catch (err) {
      const told = await e.db.query("select 1 from events where job_id = $1 and type = 'CAPTURE_STUCK' and data->>'capture' = $2", [s.job_id, s.id]);
      if (!told.rowCount) await store.appendEvent(e.db, { jobId: s.job_id, actor: "system", type: "CAPTURE_STUCK", data: { capture: s.id, amount_cents: s.amount_cents, alert: "both" } });
      e.log.error("capture outcome still unknown and PayPal can't be read", { capture: s.id, err: String(err) });
    }
  }
  for (const cap of await store.sendingCaptures(e.db, staleS)) {
    try {
      if (!(await store.claimStaleCapture(e.db, cap.id, staleS))) continue;
      out.push(await sendCapture(e, cap.id));
    } catch (err) {
      e.log.error("capture retry failed", { capture: cap.id, err: String(err) });
    }
  }
  return out;
}

// ---------- reauthorization ----------

/** Worker: past the 3-day honor period with lines still open, reauthorize once (spec section 5), through the guard. */
export async function reauthorizeDue(e: Engine): Promise<{ reauthorized: string[]; failed: string[] }> {
  const reauthorized: string[] = [];
  const failed: string[] = [];
  for (const auth of await store.authorizationsToReauthorize(e.db, e.now())) {
    const inflight = await e.db.query("select 1 from captures where authorization_id = $1 and status = 'SENDING'", [auth.id]);
    if (inflight.rowCount) continue;
    // One hold that throws doesn't stop the others being renewed.
    try {
      const r = await guardedReauthorize(e, auth);
      if (r === "reauthorized") reauthorized.push(auth.id);
      else if (r === "failed" || r === "blocked") failed.push(auth.id);
    } catch (err) {
      e.log.error("reauthorize failed", { authorization: auth.id, err: String(err) });
    }
  }
  return { reauthorized, failed };
}

/** Record a renewed hold. The money call itself is the guard's. */
export async function recordReauthorized(e: Engine, auth: store.AuthorizationRow, fresh: Authorization, openCents: number): Promise<void> {
  await e.db.tx(async (q) => {
    const created = fresh.create_time ? new Date(fresh.create_time) : e.now();
    await store.updateAuthorization(q, auth.id, {
      paypal_auth_id: fresh.id,
      reauth_attempted_at: e.now(),
      honor_until: new Date(created.getTime() + 3 * 86_400_000),
      expires_at: fresh.expiration_time ? new Date(fresh.expiration_time) : auth.expires_at,
    });
    await store.appendEvent(q, {
      jobId: auth.job_id,
      actor: "system",
      type: "REAUTHORIZED",
      data: { from: auth.paypal_auth_id, to: fresh.id, amount_cents: openCents },
    });
  });
}

// ---------- close ----------

export type CloseResult =
  | { kind: "waiting"; for: "tradesperson" | "homeowner" }
  | { kind: "closed"; release: ReleaseResult | null; voided: boolean; reasons?: string[] };

/**
 * Close needs both sides to confirm the same set of dropped lines. Dropped
 * lines' money is released: by the final capture if one is due, else by a
 * void. Both go through the guard, carrying both confirmations as approvals.
 */
export async function confirmClose(e: Engine, jobId: string, userId: string, dropLineIds: string[]): Promise<CloseResult> {
  const drop = [...new Set(dropLineIds)].sort();
  const ready = await e.db.tx(async (q) => {
    const job = await store.mustGetJob(q, jobId, { lock: true });
    const side = job.trades_id === userId ? "trades" : job.homeowner_id === userId ? "homeowner" : null;
    if (!side) throw forbidden();
    if (job.status === "COMPLETED" || job.status === "CLOSED_VOIDED") throw conflict("closed", "this job is already closed");
    if (job.status === "DRAFT" || job.status === "AWAITING_APPROVAL") throw conflict("not_authorized", "nothing is held yet");
    const lines = await store.getLines(q, jobId, { lock: true });
    const known = new Set(lines.map((l) => l.id));
    for (const id of drop) {
      if (!known.has(id)) throw new EngineError("bad_line", `line ${id} is not on this job`, 400);
      const l = lines.find((x) => x.id === id)!;
      if (l.status === "CAPTURED") throw conflict("captured", `${l.code} is already paid and can't be dropped`);
      // A payment on its way may already have landed at PayPal: dropping the line would void money that was taken.
      if (l.capture_id !== null) throw conflict("capture_in_flight", `${l.code} has a payment on its way to PayPal; close once it lands`);
    }
    const same = JSON.stringify([...(job.close_drop_line_ids ?? [])].sort()) === JSON.stringify(drop);
    const now = e.now();
    // In a judge-mode job one person plays both sides, so one confirmation counts for both.
    const both = job.demo && job.trades_id === job.homeowner_id;
    const patch: Parameters<typeof store.updateJob>[2] = same
      ? {}
      : { close_drop_line_ids: drop, close_trades_at: null, close_homeowner_at: null };
    if (side === "trades" || both) patch.close_trades_at = now;
    if (side === "homeowner" || both) patch.close_homeowner_at = now;
    const updated = await store.updateJob(q, jobId, patch);
    const dropCodes = lines.filter((l) => drop.includes(l.id)).map((l) => l.code);
    await store.appendEvent(q, {
      jobId,
      actor: side === "trades" ? "tradesperson" : "homeowner",
      type: "CLOSE_CONFIRMED",
      data: { drop: dropCodes, ...(both ? { by: "both" } : {}) },
    });
    if (!updated.close_trades_at) return { step: "wait" as const, who: "tradesperson" as const };
    if (!updated.close_homeowner_at) return { step: "wait" as const, who: "homeowner" as const };

    // Both agreed: drop, then plan the final money move.
    for (const l of lines) {
      if (drop.includes(l.id) && l.status !== "DROPPED") {
        await store.updateLine(q, l.id, { status: nextLineStatus(l.status, "DROP"), review_due_at: null });
      }
    }
    // Each open hold is closed on its own: the original scope's, and each change order's.
    const holds = (await store.authorizationsForJob(q, jobId)).filter((x) => CAPTURABLE_AUTH.includes(x.status));
    if (!holds.length) throw conflict("no_hold", "there is no hold on this job");
    const plans: { auth: store.AuthorizationRow; plan: "capture" | "void" | "nothing" }[] = [];
    for (const auth of holds) {
      const captured = await store.capturedCents(q, auth.id);
      try {
        plans.push({ auth, plan: planClose({ authorizedCents: auth.amount_cents, capturedCents: captured }, moneyLines(await store.linesOfAuthorization(q, auth))).kind });
      } catch (err) {
        throw conflict("lines_open", err instanceof Error ? err.message : String(err));
      }
    }
    await store.appendEvent(q, { jobId, actor: "system", type: "CLOSE_AGREED", data: { plan: plans.map((p) => p.plan).join(",") } });
    // Nothing more can be added once both sides agree to close.
    await cancelPendingChangeOrders(q, jobId);
    // The two confirmations of this exact proposal are the approvals the guard sees.
    const confirmations = (await store.getEvents(q, jobId))
      .filter((ev) => ev.type === "CLOSE_CONFIRMED" && JSON.stringify(ev.data?.drop ?? []) === JSON.stringify(dropCodes))
      .map((ev) => ev.id);
    return { step: "go" as const, plans, confirmations, side };
  });

  if (ready.step === "wait") return { kind: "waiting", for: ready.who };
  const init: Initiator = { kind: ready.side === "trades" ? "tradesperson" : "homeowner", userId };
  let release: ReleaseResult | null = null;
  let voided = false;
  const reasons: string[] = [];
  // Captures first: a void that closed the job first would leave approved
  // lines on another hold unpaid, and that hold never released.
  const ordered = [...ready.plans].sort((a, b) => (a.plan === "capture" ? 0 : 1) - (b.plan === "capture" ? 0 : 1));
  for (const { auth, plan } of ordered) {
    if (plan === "capture") {
      release = await guardedCapture(e, jobId, init, { final: true, authorizationId: auth.id, approvalEventIds: ready.confirmations });
    } else if (plan === "void") {
      const v = await guardedVoid(e, jobId, init, { auth }, { approvalEventIds: ready.confirmations });
      voided ||= v.voided;
      if (!v.voided) reasons.push(...v.reasons);
    }
  }
  return { kind: "closed", release, voided, ...(reasons.length ? { reasons } : {}) };
}

