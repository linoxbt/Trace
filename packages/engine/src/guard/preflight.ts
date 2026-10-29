// Fact pre-flight (Tripwire section 6): live state from PayPal and the
// database, read fresh for every money action. Rules are checked against this
// snapshot, and the snapshot is saved with the decision as proof of what the
// guard knew. If PayPal can't be read, the guard never guesses.

import { CAPTURE_TYPES, fromPayPalValue, type Facts, type MoneyAction } from "@trace/core";
import * as store from "@trace/db";
import type { Engine } from "../deps.ts";

export class FactsUnavailable extends Error {}

// Only an open dispute is cached, since that is the side that blocks money.
// "No dispute" is asked of PayPal every time, so a dispute opened since the
// last check is never hidden. A dispute webhook clears the entry at once.
const DISPUTE_TTL_MS = 60_000;
const disputeCache = new Map<string, { at: number; open: boolean }>();

export function forgetDisputes(jobId: string): void {
  disputeCache.delete(jobId);
}

/** Approval events that count for this action: a guard approval of this exact request, or a close confirmation for close actions. */
export async function approvalsFor(e: Engine, a: MoneyAction): Promise<Facts["approved_by"]> {
  const out = { homeowner: false, tradesperson: false };
  if (!a.provenance.approval_event_ids.length) return out;
  const { rows } = await e.db.query<{ actor: string; type: string; data: Record<string, unknown> | null }>(
    "select actor, type, data from events where job_id = $1 and id = any($2::bigint[])",
    [a.job_id, a.provenance.approval_event_ids],
  );
  for (const r of rows) {
    const ok =
      (r.type === "GUARD_APPROVED" && r.data?.request_id === a.request_id) ||
      (r.type === "CLOSE_CONFIRMED" && (a.type === "FINAL_CAPTURE" || a.type === "VOID"));
    if (!ok) continue;
    const by = r.data?.by;
    if (by === "both") out.homeowner = out.tradesperson = true;
    else if (r.actor === "homeowner" || by === "homeowner") out.homeowner = true;
    else if (r.actor === "tradesperson" || by === "tradesperson") out.tradesperson = true;
  }
  return out;
}

/** The parts of an action that make it "the same action" for request-id reuse (B11). */
export function payloadKey(a: MoneyAction): string {
  return JSON.stringify([a.type, a.job_id, [...a.line_ids].sort(), a.amount_cents, a.capture_id ?? null, a.dispute_id ?? null, a.paypal_authorization_id ?? null, !!a.final]);
}

async function disputeOpen(e: Engine, jobId: string, authId: string | null, seller: string | null): Promise<boolean> {
  const hit = disputeCache.get(jobId);
  if (hit && Date.now() - hit.at < DISPUTE_TTL_MS) return hit.open;
  const db = await e.db.query("select 1 from disputes where job_id = $1 and coalesce(status, '') <> 'RESOLVED' limit 1", [jobId]);
  let open = (db.rowCount ?? 0) > 0;
  if (!open && authId) {
    const caps = await e.db.query<{ paypal_capture_id: string }>(
      "select paypal_capture_id from captures where authorization_id = $1 and paypal_capture_id is not null",
      [authId],
    );
    try {
      const lists = await Promise.all(caps.rows.map((c) => e.paypal.listDisputesForTransaction(c.paypal_capture_id, seller)));
      open = lists.flat().some((d) => (d.status ?? "") !== "RESOLVED");
    } catch (err) {
      throw new FactsUnavailable(`disputes: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (open) disputeCache.set(jobId, { at: Date.now(), open });
  return open;
}

export async function gatherFacts(e: Engine, a: MoneyAction): Promise<Facts> {
  const job = await store.mustGetJob(e.db, a.job_id);
  const auth = a.authorization_id
    ? ((await e.db.query<store.AuthorizationRow>("select * from authorizations where id = $1", [a.authorization_id])).rows[0] ?? null)
    : await store.getBaseAuthorization(e.db, job.id);
  const paypalAuthId = a.paypal_authorization_id ?? auth?.paypal_auth_id ?? null;

  // The PayPal reads run in parallel: the hold's live status, and disputes.
  const [live, dispute_open] = await Promise.all([
    paypalAuthId
      ? e.paypal.getAuthorization(paypalAuthId).catch((err: unknown) => {
          throw new FactsUnavailable(`authorization: ${err instanceof Error ? err.message : String(err)}`);
        })
      : Promise.resolve(null),
    disputeOpen(e, job.id, auth?.id ?? null, job.payee_merchant_id),
  ]);

  const authAmount = auth?.amount_cents ?? (live?.amount ? fromPayPalValue(live.amount.value) : 0);
  const captured = auth ? await store.capturedCents(e.db, auth.id) : 0;
  const lines = await store.getLines(e.db, job.id);
  const mine = lines.filter((l) => a.line_ids.includes(l.id));
  const line_states: Record<string, string> = Object.fromEntries(a.line_ids.map((id) => [id, mine.find((l) => l.id === id)?.status ?? "MISSING"]));

  const verdicts = a.line_ids.length
    ? (
        await e.db.query<{ conf: number | null; second: boolean }>(
          `with latest as (
             select distinct on (line_id) line_id, photo_id, (observation->>'confidence')::float8 as conf
               from verdicts where line_id = any($1::uuid[]) and not masked order by line_id, created_at desc, pass desc)
           select conf, exists (select 1 from verdicts v where v.photo_id = latest.photo_id and v.pass = 2) as second from latest`,
          [a.line_ids],
        )
      ).rows
    : [];
  const confs = verdicts.map((v) => v.conf).filter((c): c is number => c !== null);

  // A flagged line counts as explicitly approved once the homeowner approved it themselves.
  const events = await store.getEvents(e.db, job.id);
  const injection_lines = mine.filter((l) => l.injection_flag).map((l) => l.id);
  const injection_unapproved_lines = mine
    .filter((l) => l.injection_flag)
    .filter((l) => {
      const lastVerdict = events.filter((ev) => ev.type === "VERDICT" && ev.data?.line === l.code).at(-1)?.id ?? 0;
      return !events.some((ev) => ev.type === "LINE_APPROVED" && ev.actor === "homeowner" && ev.data?.line === l.code && ev.id > lastVerdict);
    })
    .map((l) => l.id);

  const isCapture = CAPTURE_TYPES.includes(a.type);
  const window = auth
    ? (
        await e.db.query<{ c24: number; n10: number; hours: number | null }>(
          `select coalesce(sum(amount_cents) filter (where c.created_at > now() - interval '24 hours'), 0)::int8 as c24,
                  count(*) filter (where c.created_at > now() - interval '10 minutes')::int8 as n10,
                  (select extract(epoch from now() - a.created_at) / 3600 from authorizations a where a.id = $1)::float8 as hours
             from captures c where c.authorization_id = $1 and c.status in ('SENDING','COMPLETED','PENDING')`,
          [auth.id],
        )
      ).rows[0]!
    : { c24: 0, n10: 0, hours: null };

  const devices = a.line_ids.length && job.trades_device_id
    ? await e.db.query(
        `select 1 from photos where line_id = any($1::uuid[]) and kind = 'after' and not sample
           and device_id is not null and device_id <> $2 limit 1`,
        [a.line_ids, job.trades_device_id],
      )
    : { rowCount: 0 };

  const earlier = await store.decisionsForRequest(e.db, a.request_id);
  const key = payloadKey(a);

  return {
    auth_status: live?.status ?? null,
    auth_amount_cents: authAmount,
    captured_cents: captured,
    auth_remaining_cents: authAmount - captured,
    dispute_open,
    line_states,
    lines_max_price_cents: mine.reduce((m, l) => Math.max(m, l.price_cents), 0),
    verdict_min_confidence: confs.length ? Math.min(...confs) : null,
    verdict_any_second_pass: verdicts.some((v) => v.second),
    injection_lines,
    injection_unapproved_lines,
    approved_uncaptured_count: lines.filter((l) => l.status === "APPROVED" && l.capture_id === null).length,
    released_24h_cents: window.c24 + (isCapture ? a.amount_cents : 0),
    releases_10m_count: window.n10 + (isCapture ? 1 : 0),
    hours_since_authorization: window.hours,
    device_changed: (devices.rowCount ?? 0) > 0,
    request_reused: earlier.some((d) => payloadKey(d.action) !== key),
    approved_by: await approvalsFor(e, a),
  };
}

/** What the ledger records when the facts couldn't be read. */
export function unknownFacts(): Facts {
  return {
    auth_status: null,
    auth_amount_cents: 0,
    captured_cents: 0,
    auth_remaining_cents: 0,
    dispute_open: false,
    line_states: {},
    lines_max_price_cents: 0,
    verdict_min_confidence: null,
    verdict_any_second_pass: false,
    injection_lines: [],
    injection_unapproved_lines: [],
    approved_uncaptured_count: 0,
    released_24h_cents: 0,
    releases_10m_count: 0,
    hours_since_authorization: null,
    device_changed: false,
    request_reused: false,
    approved_by: { homeowner: false, tradesperson: false },
  };
}
