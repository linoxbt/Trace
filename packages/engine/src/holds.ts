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
    const row = (await e.db.query<{ job_id: string }>("select job_id from authorizations where id = $1", [authRowId])).rows[0]!;
    await guardedVoid(e, row.job_id, { kind: "worker" }, { paypalAuthId: outcome.voidId }, { requestId: `void-stale-${outcome.voidId}` }).catch((err) =>
      e.log.error("void of a hold confirmed after its job moved on failed", { err: String(err) }),
    );
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
