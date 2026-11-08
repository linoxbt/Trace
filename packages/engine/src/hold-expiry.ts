// The end of a PayPal hold. An authorization lasts 29 days from when it was
// placed (renewing it doesn't extend that). If a job is still open as that day
// nears, Trace:
//   1. warns both sides a few days ahead, naming the lines still unpaid;
//   2. in the last day, releases approved work through the guard, where the
//      amount presets stop asking first (HOLD_LAPSE_WINDOW_H) but every
//      built-in rule still applies;
//   3. once the hold has lapsed, asks PayPal and records it, so the job closes
//      even if PayPal's webhook never arrives. The client's money was never
//      charged; PayPal simply stops holding it.

import { HOLD_LAPSE_WINDOW_H, sum } from "@trace/core";
import * as store from "@trace/db";
import type { Engine } from "./deps.ts";
import { closeJobIfSettled, release, type ReleaseResult } from "./money.ts";

/** How far ahead both sides are told a hold is about to lapse. */
export const HOLD_WARNING_DAYS = 3;
/** How often the last-day release is tried again for a job it couldn't pay. */
export const LAPSE_RELEASE_RETRY_MS = 2 * 3600_000;

const OPEN_JOB = "('AUTHORIZED','IN_PROGRESS','PARTIALLY_RELEASED')";
// The lines a hold pays for: the scope's lines for the base hold, a change order's lines for its hold.
const LINES_OF_HOLD = `l.job_id = a.job_id and case when a.kind = 'base' then l.change_order_id is null
                         else l.change_order_id = (select c.id from change_orders c where c.authorization_id = a.id) end`;

function unpaid(lines: store.LineRow[]): store.LineRow[] {
  return lines.filter((l) => l.status !== "CAPTURED" && l.status !== "DROPPED");
}

/** Worker: tell both sides once, a few days ahead, that a hold with unpaid lines is about to lapse. */
export async function warnExpiringHolds(e: Engine, limit = 20): Promise<number> {
  const now = e.now();
  const { rows } = await e.db.query<store.AuthorizationRow>(
    `select a.* from authorizations a join jobs j on j.id = a.job_id
      where a.status in ('CREATED','PARTIALLY_CAPTURED') and a.expires_at is not null
        and a.expires_at > $1 and a.expires_at <= $1 + make_interval(days => $2)
        and j.status in ${OPEN_JOB}
        and exists (select 1 from lines l where ${LINES_OF_HOLD} and l.status not in ('CAPTURED','DROPPED'))
        and not exists (select 1 from events ev where ev.job_id = a.job_id and ev.type = 'HOLD_EXPIRING' and ev.data->>'hold' = a.id::text)
      order by a.expires_at limit $3`,
    [now, HOLD_WARNING_DAYS, limit],
  );
  let warned = 0;
  for (const auth of rows) {
    const open = unpaid(await store.linesOfAuthorization(e.db, auth));
    if (!open.length) continue;
    await store.appendEvent(e.db, {
      jobId: auth.job_id,
      actor: "system",
      type: "HOLD_EXPIRING",
      data: {
        hold: auth.id,
        authorization_id: auth.paypal_auth_id,
        expires_at: auth.expires_at!.toISOString(),
        lines: open.map((l) => l.code),
        held_cents: sum(open.map((l) => l.price_cents)),
        alert: "both",
      },
    });
    warned += 1;
  }
  return warned;
}

/**
 * Worker: in the hold's last day, release approved lines that are still unpaid,
 * through the guard. A job is tried again every couple of hours, so a refusal
 * (PayPal unreachable, a dispute) isn't repeated every minute.
 */
export async function releaseBeforeHoldLapses(e: Engine, limit = 10): Promise<ReleaseResult[]> {
  const now = e.now();
  const { rows } = await e.db.query<{ job_id: string }>(
    `select a.job_id, min(a.expires_at) as soonest from authorizations a join jobs j on j.id = a.job_id
      where a.status in ('CREATED','PARTIALLY_CAPTURED') and a.expires_at is not null
        and a.expires_at > $1 and a.expires_at <= $1 + make_interval(hours => $2)
        and j.status in ${OPEN_JOB}
        and exists (select 1 from lines l where ${LINES_OF_HOLD} and l.status = 'APPROVED' and l.capture_id is null)
        and not exists (select 1 from events ev where ev.job_id = a.job_id and ev.type = 'HOLD_LAPSE_RELEASE'
                          and (ev.data->>'at')::timestamptz > $1 - make_interval(secs => $3))
      group by a.job_id order by soonest limit $4`,
    [now, HOLD_LAPSE_WINDOW_H, LAPSE_RELEASE_RETRY_MS / 1000, limit],
  );
  const out: ReleaseResult[] = [];
  for (const { job_id } of rows) {
    await store.appendEvent(e.db, { jobId: job_id, actor: "system", type: "HOLD_LAPSE_RELEASE", data: { window_hours: HOLD_LAPSE_WINDOW_H, at: now.toISOString() } });
    try {
      out.push(await release(e, job_id, "system"));
    } catch (err) {
      e.log.error("release before the hold lapses failed", { job: job_id, err: String(err) });
    }
  }
  return out;
}

/** Worker: holds past their expiry date are checked with PayPal and, once it says they've lapsed, recorded and their jobs closed. */
export async function expireLapsedHolds(e: Engine, limit = 10): Promise<number> {
  const now = e.now();
  const { rows } = await e.db.query<store.AuthorizationRow>(
    `select a.* from authorizations a
      where a.status in ('CREATED','PARTIALLY_CAPTURED') and a.expires_at is not null and a.expires_at <= $1
        and a.updated_at < $1 - interval '10 minutes'
        and not exists (select 1 from captures c where c.authorization_id = a.id and c.status = 'SENDING')
      order by a.expires_at limit $2`,
    [now, limit],
  );
  let expired = 0;
  for (const auth of rows) {
    try {
      const fresh = await e.paypal.getAuthorization(auth.paypal_auth_id);
      if (fresh.status !== "EXPIRED" && fresh.status !== "VOIDED") {
        // Still held (PayPal's clock, or a later date than we recorded): keep the new date and look again later.
        const later = fresh.expiration_time ? new Date(fresh.expiration_time) : null;
        await e.db.query("update authorizations set expires_at = coalesce($2, expires_at), updated_at = $3 where id = $1", [auth.id, later, now]);
        continue;
      }
      const done = await e.db.tx(async (q) => {
        const before = await store.mustGetJob(q, auth.job_id, { lock: true });
        const locked = (await q.query<store.AuthorizationRow>("select * from authorizations where id = $1 for update", [auth.id])).rows[0]!;
        if (locked.status !== "CREATED" && locked.status !== "PARTIALLY_CAPTURED") return false;
        const captured = await store.capturedCents(q, auth.id);
        const open = unpaid(await store.linesOfAuthorization(q, locked));
        await store.updateAuthorization(q, auth.id, { status: "VOIDED" });
        const after = await closeJobIfSettled(q, auth.job_id);
        await store.appendEvent(q, {
          jobId: auth.job_id,
          actor: "paypal",
          type: "HOLD_EXPIRED",
          data: {
            hold: auth.id,
            authorization_id: auth.paypal_auth_id,
            paypal_status: fresh.status,
            released_cents: Math.max(0, auth.amount_cents - captured),
            lines: open.map((l) => l.code),
            alert: "both",
            ...(after !== before.status ? { job: after } : {}),
          },
        });
        return true;
      });
      if (done) expired += 1;
    } catch (err) {
      e.log.warn("expired hold check failed", { auth: auth.paypal_auth_id, err: String(err) });
    }
  }
  return expired;
}
