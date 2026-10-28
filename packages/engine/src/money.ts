// Flow D and the close: every capture, void and reauthorization. Amounts are
// recomputed from line states inside a locked transaction; a capture is put on
// record (SENDING, with its PayPal-Request-Id) before it is sent, so a lost
// response is retried with the same ID and never becomes a second capture.
// Every transaction here locks the job row first, then authorization, lines
// and captures, so two of them on one job queue instead of deadlocking.

import { randomUUID } from "node:crypto";
import {
  formatMoney,
  isResolvedLine,
  nextJobStatus,
  nextLineStatus,
  planClose,
  planRelease,
  sum,
  type MoneyLine,
} from "@trace/core";
import * as store from "@trace/db";
import { isRetryable, PayPalError, type Capture } from "@trace/paypal";
import type { Queryable } from "@trace/db";
import type { Engine } from "./deps.ts";
import { conflict, EngineError, forbidden } from "./errors.ts";

const CAPTURABLE_AUTH: store.AuthorizationStatus[] = ["CREATED", "PARTIALLY_CAPTURED"];
const RELEASABLE_JOB = ["AUTHORIZED", "IN_PROGRESS", "PARTIALLY_RELEASED"];

export type ReleaseResult =
  | { kind: "nothing" }
  | { kind: "captured"; captureId: string; amountCents: number; status: store.CaptureStatus }
  | { kind: "sending"; captureId: string; amountCents: number }
  | { kind: "failed"; captureId: string; amountCents: number; reason: string };

function moneyLines(lines: store.LineRow[]): MoneyLine[] {
  return lines.map((l) => ({ id: l.id, status: l.status, priceCents: l.price_cents, captureRef: l.capture_id }));
}

function noteToPayer(lines: store.LineRow[], currency: string): string {
  return `Trace: verified work released: ${lines.map((l) => `${l.code} ${l.title} ${formatMoney(l.price_cents, currency)}`).join("; ")}`;
}

/** Reserve the releasable lines in one locked transaction and put the capture on record. */
async function reserveCapture(
  q: Queryable,
  jobId: string,
  opts: { forceFinal?: boolean; actor: store.Actor },
): Promise<store.CaptureRow | null> {
  const job = await store.mustGetJob(q, jobId, { lock: true });
  if (!RELEASABLE_JOB.includes(job.status)) throw conflict("not_releasable", `nothing can be released while the job is ${job.status}`);
  const auth = await store.getBaseAuthorization(q, jobId, { lock: true });
  if (!auth || !CAPTURABLE_AUTH.includes(auth.status)) throw conflict("no_hold", "there is no open hold on this job");
  const lines = await store.getLines(q, jobId, { lock: true });
  const captured = await store.capturedCents(q, auth.id);
  const plan = planRelease({ authorizedCents: auth.amount_cents, capturedCents: captured }, moneyLines(lines));
  if (!plan) return null;
  const n = (await store.countCaptures(q, auth.id)) + 1;
  const cap = await store.insertCapture(q, {
    authorizationId: auth.id,
    requestId: `capture-${randomUUID()}`,
    invoiceId: `${jobId}-r${n}`,
    amountCents: plan.amountCents,
    final: plan.final || !!opts.forceFinal,
    lineIds: plan.lineIds,
  });
  for (const id of plan.lineIds) await store.updateLine(q, id, { capture_id: cap.id });
  await store.appendEvent(q, {
    jobId,
    actor: opts.actor,
    type: "RELEASE_STARTED",
    data: { capture: cap.id, amount_cents: cap.amount_cents, final: cap.final, lines: lines.filter((l) => plan.lineIds.includes(l.id)).map((l) => l.code) },
  });
  return cap;
}

/** Release every approved line now (homeowner's button, or the worker after a review window). */
export async function release(e: Engine, jobId: string, actor: store.Actor = "homeowner"): Promise<ReleaseResult> {
  const cap = await e.db.tx((q) => reserveCapture(q, jobId, { actor }));
  if (!cap) return { kind: "nothing" };
  return sendCapture(e, cap.id);
}

/** Send a capture that is on record as SENDING. Retries reuse its request ID. */
export async function sendCapture(e: Engine, captureId: string): Promise<ReleaseResult> {
  const cap = await store.getCapture(e.db, captureId);
  if (!cap) throw new EngineError("not_found", `capture ${captureId} not found`, 404);
  if (cap.status !== "SENDING") return settledResult(cap);
  const auth = (await e.db.query<store.AuthorizationRow>("select * from authorizations where id = $1", [cap.authorization_id])).rows[0]!;
  const lines = (await store.getLines(e.db, auth.job_id)).filter((l) => cap.line_ids.includes(l.id));
  await store.updateCapture(e.db, cap.id, { bumpAttempts: true });

  // Status check before the first send (spec section 5). Retries skip it: a
  // capture of ours that already landed can make the authorization look spent.
  if (cap.attempts === 0) {
    try {
      const live = await e.paypal.getAuthorization(auth.paypal_auth_id);
      if (live.status === "VOIDED" || live.status === "DENIED") {
        return failCapture(e, cap, `the hold is ${live.status.toLowerCase()} at PayPal`);
      }
    } catch (err) {
      if (!isRetryable(err)) throw err;
      await store.updateCapture(e.db, cap.id, { last_error: String(err) });
      return { kind: "sending", captureId: cap.id, amountCents: cap.amount_cents };
    }
  }

  let result: Capture;
  try {
    result = await e.paypal.captureAuthorization(
      auth.paypal_auth_id,
      { amountCents: cap.amount_cents, currency: auth.currency, invoiceId: cap.invoice_id, finalCapture: cap.final, noteToPayer: noteToPayer(lines, auth.currency) },
      cap.request_id,
    );
  } catch (err) {
    if (isRetryable(err)) {
      e.log.warn("capture outcome unknown, will retry", { capture: cap.id, err: String(err) });
      await store.updateCapture(e.db, cap.id, { last_error: String(err) });
      return { kind: "sending", captureId: cap.id, amountCents: cap.amount_cents };
    }
    if (err instanceof PayPalError && err.has("DUPLICATE_INVOICE_ID")) {
      // Our invoice ID is already on a capture: an earlier attempt landed. Find it on the order.
      const found = await findCaptureOnOrder(e, auth.paypal_order_id, cap.invoice_id);
      if (found) return settleCapture(e, cap.id, found);
    }
    return failCapture(e, cap, err instanceof Error ? err.message : String(err));
  }
  return settleCapture(e, cap.id, result);
}

async function findCaptureOnOrder(e: Engine, orderId: string, invoiceId: string): Promise<Capture | null> {
  const order = await e.paypal.getOrder(orderId);
  return order.purchase_units?.flatMap((u) => u.payments?.captures ?? []).find((c) => c.invoice_id === invoiceId) ?? null;
}

function settledResult(cap: store.CaptureRow): ReleaseResult {
  if (cap.status === "SENDING") return { kind: "sending", captureId: cap.id, amountCents: cap.amount_cents };
  if (cap.status === "FAILED" || cap.status === "DECLINED") {
    return { kind: "failed", captureId: cap.id, amountCents: cap.amount_cents, reason: cap.last_error ?? cap.status };
  }
  return { kind: "captured", captureId: cap.id, amountCents: cap.amount_cents, status: cap.status };
}

/** PayPal refused the capture: nothing was charged. Its lines go back to releasable. */
async function failCapture(e: Engine, cap: store.CaptureRow, reason: string): Promise<ReleaseResult> {
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
      await store.updateAuthorization(q, auth.id, {
        status: cap.final || captured >= auth.amount_cents ? "CAPTURED" : "PARTIALLY_CAPTURED",
      });
      const jobNext = allResolved ? nextJobStatus(job.status, "COMPLETED") : nextJobStatus(job.status, "PARTIAL_RELEASE");
      await store.updateJob(q, job.id, { status: jobNext });
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
      if (wasLive) {
        const captured = await store.capturedCents(q, auth.id);
        await store.updateAuthorization(q, auth.id, { status: captured > 0 ? "PARTIALLY_CAPTURED" : "CREATED" });
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
 * money) unless a final capture already did.
 */
export async function voidIfDone(e: Engine, authorizationId: string): Promise<boolean> {
  const auth = (await e.db.query<store.AuthorizationRow>("select * from authorizations where id = $1", [authorizationId])).rows[0];
  if (!auth || !CAPTURABLE_AUTH.includes(auth.status)) return false;
  const lines = await store.getLines(e.db, auth.job_id);
  if (!lines.every((l) => isResolvedLine(l.status))) return false;
  const inflight = await e.db.query("select 1 from captures where authorization_id = $1 and status = 'SENDING'", [auth.id]);
  if (inflight.rowCount) return false;
  return voidAuthorization(e, auth, "system");
}

async function voidAuthorization(e: Engine, auth: store.AuthorizationRow, actor: store.Actor): Promise<boolean> {
  try {
    await e.paypal.voidAuthorization(auth.paypal_auth_id, `void-${auth.paypal_auth_id}`);
  } catch (err) {
    if (!(err instanceof PayPalError && err.has("PREVIOUSLY_VOIDED"))) throw err;
  }
  await e.db.tx(async (q) => {
    const job = await store.mustGetJob(q, auth.job_id, { lock: true });
    const locked = (await q.query<store.AuthorizationRow>("select * from authorizations where id = $1 for update", [auth.id])).rows[0]!;
    if (locked.status === "VOIDED") return;
    const captured = await store.capturedCents(q, auth.id);
    await store.updateAuthorization(q, auth.id, { status: "VOIDED" });
    if (job.status !== "COMPLETED" && job.status !== "CLOSED_VOIDED") {
      await store.updateJob(q, job.id, { status: captured > 0 ? nextJobStatus(job.status, "COMPLETED") : nextJobStatus(job.status, "VOIDED") });
    }
    await store.appendEvent(q, {
      jobId: auth.job_id,
      actor,
      type: "VOIDED",
      data: { authorization_id: auth.paypal_auth_id, released_cents: auth.amount_cents - captured },
    });
  });
  return true;
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
    await store.appendEvent(q, { jobId: job.id, actor: "homeowner", type: "LINE_FLAGGED", data: { line: line.code, note, notify: "tradesperson" } });
    return out;
  });
}

/** Worker: silence approves VERIFIED lines whose window lapsed, then releases their jobs. */
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
export async function retrySendingCaptures(e: Engine, staleS = 30): Promise<ReleaseResult[]> {
  const out: ReleaseResult[] = [];
  for (const cap of await store.sendingCaptures(e.db, staleS)) {
    try {
      out.push(await sendCapture(e, cap.id));
    } catch (err) {
      e.log.error("capture retry failed", { capture: cap.id, err: String(err) });
    }
  }
  return out;
}

// ---------- reauthorization ----------

/** Worker: past the 3-day honor period with lines still open, reauthorize once (spec section 5). */
export async function reauthorizeDue(e: Engine): Promise<{ reauthorized: string[]; failed: string[] }> {
  const reauthorized: string[] = [];
  const failed: string[] = [];
  for (const auth of await store.authorizationsToReauthorize(e.db, e.now())) {
    const inflight = await e.db.query("select 1 from captures where authorization_id = $1 and status = 'SENDING'", [auth.id]);
    if (inflight.rowCount) continue;
    const lines = await store.getLines(e.db, auth.job_id);
    const openCents = sum(lines.filter((l) => !isResolvedLine(l.status)).map((l) => l.price_cents));
    try {
      const fresh = await e.paypal.reauthorize(auth.paypal_auth_id, { cents: openCents, currency: auth.currency }, `reauthorize-${auth.paypal_auth_id}`);
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
      reauthorized.push(auth.id);
    } catch (err) {
      if (isRetryable(err)) {
        e.log.warn("reauthorize will retry", { authorization: auth.id, err: String(err) });
        continue;
      }
      // Not allowed (section 17 open question): record it once and alert. The
      // fallback is to capture what is approved and open a new order for the rest.
      await e.db.tx(async (q) => {
        await store.updateAuthorization(q, auth.id, { reauth_attempted_at: e.now() });
        await store.appendEvent(q, {
          jobId: auth.job_id,
          actor: "system",
          type: "REAUTHORIZE_FAILED",
          data: { authorization_id: auth.paypal_auth_id, reason: err instanceof Error ? err.message : String(err), alert: "both" },
        });
      });
      failed.push(auth.id);
    }
  }
  return { reauthorized, failed };
}

// ---------- close ----------

export type CloseResult =
  | { kind: "waiting"; for: "tradesperson" | "homeowner" }
  | { kind: "closed"; release: ReleaseResult | null; voided: boolean };

/**
 * Close needs both sides to confirm the same set of dropped lines. Dropped
 * lines' money is released: by the final capture if one is due, else by a void.
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
    await store.appendEvent(q, {
      jobId,
      actor: side === "trades" ? "tradesperson" : "homeowner",
      type: "CLOSE_CONFIRMED",
      data: { drop: lines.filter((l) => drop.includes(l.id)).map((l) => l.code) },
    });
    if (!updated.close_trades_at) return { step: "wait" as const, who: "tradesperson" as const };
    if (!updated.close_homeowner_at) return { step: "wait" as const, who: "homeowner" as const };

    // Both agreed: drop, then plan the final money move.
    for (const l of lines) {
      if (drop.includes(l.id) && l.status !== "DROPPED") {
        await store.updateLine(q, l.id, { status: nextLineStatus(l.status, "DROP"), review_due_at: null });
      }
    }
    const auth = await store.getBaseAuthorization(q, jobId, { lock: true });
    if (!auth) throw conflict("no_hold", "there is no hold on this job");
    const after = await store.getLines(q, jobId);
    const captured = await store.capturedCents(q, auth.id);
    let plan;
    try {
      plan = planClose({ authorizedCents: auth.amount_cents, capturedCents: captured }, moneyLines(after));
    } catch (err) {
      throw conflict("lines_open", err instanceof Error ? err.message : String(err));
    }
    await store.appendEvent(q, { jobId, actor: "system", type: "CLOSE_AGREED", data: { plan: plan.kind } });
    if (plan.kind === "capture") {
      const cap = await reserveCapture(q, jobId, { forceFinal: true, actor: "system" });
      return { step: "go" as const, captureId: cap?.id ?? null, auth, voidNow: false };
    }
    return { step: "go" as const, captureId: null, auth, voidNow: plan.kind === "void" };
  });

  if (ready.step === "wait") return { kind: "waiting", for: ready.who };
  if (ready.captureId) {
    const res = await sendCapture(e, ready.captureId);
    return { kind: "closed", release: res, voided: false };
  }
  const voided = ready.voidNow ? await voidAuthorization(e, ready.auth, "system") : false;
  return { kind: "closed", release: null, voided };
}
