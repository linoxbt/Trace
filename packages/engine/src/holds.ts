// A hold PayPal accepts but hasn't confirmed yet: the authorization comes back
// PENDING (PayPal is reviewing the payment). It is recorded so it is never lost,
// nothing is paid from it, and it becomes a real hold, or is closed, once PayPal
// says which. The webhook tells us first; the worker asks PayPal in case it
// doesn't arrive.

import * as store from "@trace/db";
import type { Authorization } from "@trace/paypal";
import { nextJobStatus } from "@trace/core";
import type { Engine } from "./deps.ts";
import { HONOR_PERIOD_DAYS } from "./deps.ts";
import { guardedVoid } from "./guard/execute.ts";

const HELD = ["AUTHORIZED", "IN_PROGRESS", "PARTIALLY_RELEASED"];

/** Record PayPal's answer for a hold that was pending. Safe to call again; does nothing once it isn't pending. */
export async function settlePendingHold(e: Engine, authRowId: string, fresh: Authorization): Promise<"held" | "closed" | "unchanged"> {
  if (fresh.status === "PENDING") return "unchanged";
  const outcome = await e.db.tx(async (q) => {
    const first = (await q.query<store.AuthorizationRow>("select * from authorizations where id = $1", [authRowId])).rows[0];
    if (!first) return { result: "unchanged" as const };
    const job = await store.mustGetJob(q, first.job_id, { lock: true });
    const auth = (await q.query<store.AuthorizationRow>("select * from authorizations where id = $1 for update", [authRowId])).rows[0]!;
    if (auth.status !== "PENDING") return { result: "unchanged" as const };
    const co = auth.kind === "change_order" ? (await q.query<store.ChangeOrderRow>("select * from change_orders where authorization_id = $1 for update", [auth.id])).rows[0] ?? null : null;

    if (fresh.status !== "CREATED") {
      // Denied or voided at PayPal: nothing is held.
      await store.updateAuthorization(q, auth.id, { status: fresh.status === "VOIDED" ? "VOIDED" : "DENIED" });
      if (auth.kind === "base" && job.status === "AWAITING_APPROVAL") await store.updateJob(q, job.id, { status: nextJobStatus(job.status, "VOIDED") });
      if (co && co.status === "AWAITING_APPROVAL") await q.query("update change_orders set status = 'DECLINED', updated_at = now() where id = $1", [co.id]);
      await store.appendEvent(q, { jobId: job.id, actor: "paypal", type: "HOLD_DENIED", data: { authorization_id: auth.paypal_auth_id, status: fresh.status, ...(co ? { change_order: co.code } : {}), alert: "both" } });
      return { result: "closed" as const };
    }

    const created = fresh.create_time ? new Date(fresh.create_time) : e.now();
    const patch = {
      status: "CREATED" as const,
      honor_until: new Date(created.getTime() + HONOR_PERIOD_DAYS * 86_400_000),
      expires_at: fresh.expiration_time ? new Date(fresh.expiration_time) : auth.expires_at,
    };
    if (auth.kind === "base") {
      if (job.status !== "AWAITING_APPROVAL") {
        // The job was closed while PayPal reviewed: the hold has nothing to pay for.
        await store.updateAuthorization(q, auth.id, patch);
        return { result: "closed" as const, voidId: auth.paypal_auth_id };
      }
      await store.updateAuthorization(q, auth.id, patch);
      await store.updateJob(q, job.id, { status: nextJobStatus(job.status, "AUTHORIZED") });
      await store.appendEvent(q, { jobId: job.id, actor: "paypal", type: "AUTHORIZED", data: { authorization_id: auth.paypal_auth_id, amount_cents: auth.amount_cents, expires_at: fresh.expiration_time ?? null, after_review: true } });
      return { result: "held" as const };
    }
    await store.updateAuthorization(q, auth.id, patch);
    if (!co || co.status !== "AWAITING_APPROVAL" || !HELD.includes(job.status) || job.disputed) return { result: "closed" as const, voidId: auth.paypal_auth_id };
    await q.query("update change_orders set status = 'AUTHORIZED', updated_at = now() where id = $1", [co.id]);
    await store.appendLines(q, job.id, co.lines, co.id);
    await store.appendEvent(q, {
      jobId: job.id,
      actor: "paypal",
      type: "AUTHORIZED",
      data: { authorization_id: auth.paypal_auth_id, amount_cents: auth.amount_cents, change_order: co.code, lines: co.lines.map((l) => l.code), expires_at: fresh.expiration_time ?? null, after_review: true },
    });
    return { result: "held" as const };
  });
  if ("voidId" in outcome && outcome.voidId) {
    // The row is ours (now CREATED): void it through it, so the record follows.
    const row = (await e.db.query<store.AuthorizationRow>("select * from authorizations where id = $1", [authRowId])).rows[0]!;
    await releaseUnusedHold(e, row.job_id, { auth: row }, "stale");
  }
  return outcome.result;
}

/** Worker: ask PayPal about holds still pending review, a few at a time. */
export async function checkPendingHolds(e: Engine, limit = 10): Promise<number> {
  const { rows } = await e.db.query<store.AuthorizationRow>(
    "select * from authorizations where status = 'PENDING' and updated_at < now() - interval '2 minutes' order by updated_at limit $1",
    [limit],
  );
  let moved = 0;
  for (const auth of rows) {
    try {
      const fresh = await e.paypal.getAuthorization(auth.paypal_auth_id);
      if ((await settlePendingHold(e, auth.id, fresh)) !== "unchanged") moved += 1;
      else await e.db.query("update authorizations set updated_at = now() where id = $1", [auth.id]);
    } catch (err) {
      e.log.warn("pending hold check failed", { auth: auth.paypal_auth_id, err: String(err) });
    }
  }
  return moved;
}

/**
 * Release a hold Trace won't use (it came back wrong, or its job or change
 * order moved on while PayPal authorized it). If PayPal can't be reached or the
 * guard won't allow it, both sides are told, so a person can release it, rather
 * than the client's money staying held unseen until PayPal lets it lapse.
 */
export async function releaseUnusedHold(e: Engine, jobId: string, target: { auth: store.AuthorizationRow } | { paypalAuthId: string }, why: string): Promise<boolean> {
  const id = "auth" in target ? target.auth.paypal_auth_id : target.paypalAuthId;
  let reason: string;
  try {
    const v = await guardedVoid(e, jobId, { kind: "worker" }, target, { requestId: `void-${why}-${id}` });
    if (v.voided) return true;
    reason = v.reasons.join(" ");
  } catch (err) {
    reason = err instanceof Error ? err.message : String(err);
  }
  e.log.error("an unused hold couldn't be released", { job: jobId, authorization: id, why, reason });
  await store.appendEvent(e.db, { jobId, actor: "system", type: "HOLD_NOT_RELEASED", data: { authorization_id: id, why, reason, alert: "both" } }).catch(() => undefined);
  return false;
}
