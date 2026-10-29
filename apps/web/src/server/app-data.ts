import "server-only";
import { engine } from "./engine";

// Data for the signed-in app's pages: everything across the jobs a person is
// a party to, and the jobs waiting for them by email. Every query is scoped
// to the user (as tradesperson or homeowner) in SQL.

export type Side = "tradesperson" | "homeowner";

/** PayPal's dispute reasons, in plain words. */
export const DISPUTE_REASON: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Work not received",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Work not as described",
  UNAUTHORISED: "Payment not authorised",
  CREDIT_NOT_PROCESSED: "Refund not processed",
  DUPLICATE_TRANSACTION: "Charged twice",
  INCORRECT_AMOUNT: "Wrong amount",
};

export interface Profile {
  displayName: string;
  paypalEmail: string | null;
  createdAt: string;
}

export async function profileOf(userId: string): Promise<Profile> {
  const { rows } = await engine().db.query<{ display_name: string; paypal_email: string | null; created_at: Date }>(
    "select display_name, paypal_email, created_at from profiles where id = $1",
    [userId],
  );
  const p = rows[0];
  return { displayName: p?.display_name ?? "there", paypalEmail: p?.paypal_email ?? null, createdAt: (p?.created_at ?? new Date()).toISOString() };
}

export interface JobRowView {
  id: string;
  address: string;
  status: string;
  side: Side;
  otherParty: string;
  totalCents: number;
  heldCents: number;
  releasedCents: number;
  lines: number;
  paid: number;
  openLines: number;
  demo: boolean;
  disputed: boolean;
  /** The job type (home_repair, cleaning, car, ...). */
  category: string;
  createdAt: string;
  updatedAt: string;
  /** The latest after-photo, else a before-photo. */
  coverUrl: string | null;
}

/** A photo per job for its card: the newest proof, else the first before-photo. */
export async function coversFor(jobIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!jobIds.length) return out;
  const { rows } = await engine().db.query<{ job_id: string; storage_path: string }>(
    `select distinct on (job_id) job_id, storage_path from photos
      where job_id = any($1::uuid[]) and kind in ('after','during','before')
      order by job_id, (kind = 'before'), case when kind = 'before' then taken_at end asc, taken_at desc`,
    [jobIds],
  );
  const e = engine();
  await Promise.all(rows.map(async (r) => out.set(r.job_id, await e.storage.signedUrl(r.storage_path, 600).catch(() => ""))));
  for (const [k, v] of out) if (!v) out.delete(k);
  return out;
}

/** The user's jobs, newest activity first. */
export async function jobsOf(userId: string, limit = 200): Promise<JobRowView[]> {
  const { rows } = await engine().db.query<{
    id: string;
    address: string;
    status: string;
    trades_id: string;
    homeowner_id: string | null;
    homeowner_email: string;
    trades_name: string | null;
    demo: boolean;
    disputed: boolean;
    total: number;
    lines: number;
    paid: number;
    open: number;
    held: number | null;
    released: number;
    created_at: Date;
    updated_at: Date;
    category: string;
  }>(
    `select j.id, j.address, j.status, j.trades_id, j.homeowner_id, j.homeowner_email, j.demo, j.disputed, j.created_at,
       greatest(j.updated_at, coalesce((select max(at) from events e where e.job_id = j.id), j.updated_at)) as updated_at,
       (select display_name from profiles where id = j.trades_id) as trades_name,
       (select coalesce(sum(price_cents),0)::int8 from lines where job_id = j.id) as total,
       (select count(*)::int8 from lines where job_id = j.id) as lines,
       (select count(*)::int8 from lines where job_id = j.id and status = 'CAPTURED') as paid,
       (select count(*)::int8 from lines where job_id = j.id and status not in ('CAPTURED','DROPPED')) as open,
       (select sum(a.amount_cents)::int8 from authorizations a where a.job_id = j.id) as held,
       coalesce((select sum(c.amount_cents) from captures c join authorizations a on a.id = c.authorization_id where a.job_id = j.id and c.status in ('COMPLETED','PENDING')),0)::int8 as released,
       j.category
     from jobs j
     where $1 in (j.trades_id, j.homeowner_id)
     order by 9 desc limit $2`,
    [userId, limit],
  );
  const ids = rows.map((r) => r.id);
  const covers = await coversFor(ids);
  return rows
    .map((r) => ({
      id: r.id,
      address: r.address,
      status: r.status,
      side: (r.trades_id === userId ? "tradesperson" : "homeowner") as Side,
      otherParty: r.trades_id === userId ? r.homeowner_email : (r.trades_name ?? "Who does the work"),
      totalCents: r.total,
      heldCents: r.held ?? 0,
      releasedCents: r.released,
      lines: r.lines,
      paid: r.paid,
      openLines: r.open,
      demo: r.demo,
      disputed: r.disputed,
      category: r.category,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      coverUrl: covers.get(r.id) ?? null,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface Invite {
  id: string;
  address: string;
  from: string;
  totalCents: number;
  lines: number;
  sentAt: string;
}

/** Scopes sent to this email that the person hasn't opened yet. */
export async function invitesFor(email: string | null): Promise<Invite[]> {
  if (!email) return [];
  const { rows } = await engine().db.query<{ id: string; address: string; from_name: string | null; total: number; lines: number; sent: Date }>(
    `select j.id, j.address, p.display_name as from_name,
       (select coalesce(sum(price_cents),0)::int8 from lines where job_id = j.id) as total,
       (select count(*)::int8 from lines where job_id = j.id) as lines,
       coalesce((select max(at) from events e where e.job_id = j.id and e.type = 'SCOPE_SENT'), j.created_at) as sent
     from jobs j join profiles p on p.id = j.trades_id
     where lower(j.homeowner_email) = lower($1) and j.homeowner_id is null and j.status = 'AWAITING_APPROVAL'
     order by sent desc limit 20`,
    [email],
  );
  return rows.map((r) => ({ id: r.id, address: r.address, from: r.from_name ?? "Someone", totalCents: r.total, lines: r.lines, sentAt: r.sent.toISOString() }));
}

export interface InboxItem {
  key: string;
  kind: "invite" | "approve_hold" | "guard_approval" | "review" | "prove" | "finish_scope" | "dispute";
  jobId: string;
  address: string;
  title: string;
  detail: string;
  amountCents: number | null;
  at: string;
  /** Lower comes first. */
  rank: number;
  coverUrl?: string | null;
  /** Where the row opens, when it isn't the job page. */
  href?: string;
}

/** Everything waiting on this person, most urgent first. */
export async function inboxOf(userId: string, email: string | null): Promise<InboxItem[]> {
  const db = engine().db;
  const [invites, jobs, approvals, review, prove, disputes] = await Promise.all([
    invitesFor(email),
    db.query<{ id: string; address: string; status: string; trades_id: string; total: number; updated_at: Date }>(
      `select j.id, j.address, j.status, j.trades_id, j.updated_at,
         (select coalesce(sum(price_cents),0)::int8 from lines where job_id = j.id) as total
       from jobs j where $1 in (j.trades_id, j.homeowner_id) and j.status in ('DRAFT','AWAITING_APPROVAL')`,
      [userId],
    ),
    db.query<{
      id: string;
      job_id: string;
      address: string;
      approver: string;
      approvals: { by: string }[];
      expires_at: Date;
      created_at: Date;
      trades_id: string;
      homeowner_id: string | null;
      demo: boolean;
      action: { type: string; amount_cents: number };
      decision: { reasons_plain: string[] };
    }>(
      `select a.id, a.job_id, j.address, a.approver, a.approvals, a.expires_at, a.created_at, j.trades_id, j.homeowner_id, j.demo, d.action, d.decision
       from approval_requests a join jobs j on j.id = a.job_id join guard_decisions d on d.id = a.decision_id
       where a.status = 'PENDING' and $1 in (j.trades_id, j.homeowner_id)`,
      [userId],
    ),
    db.query<{ job_id: string; address: string; n: number; cents: number; due: Date | null; last: Date }>(
      `select l.job_id, j.address, count(*)::int8 as n, sum(l.price_cents)::int8 as cents, min(l.review_due_at) as due, j.updated_at as last
       from lines l join jobs j on j.id = l.job_id
       where j.homeowner_id = $1 and l.status in ('VERIFIED','NEEDS_REVIEW') group by l.job_id, j.address, j.updated_at`,
      [userId],
    ),
    db.query<{ job_id: string; address: string; n: number; failed: number; last: Date }>(
      `select l.job_id, j.address, count(*)::int8 as n, count(*) filter (where l.status in ('FAILED','FLAGGED'))::int8 as failed, j.updated_at as last
       from lines l join jobs j on j.id = l.job_id
       where j.trades_id = $1 and j.status in ('AUTHORIZED','IN_PROGRESS','PARTIALLY_RELEASED') and l.status in ('PENDING','PROVING','FAILED','FLAGGED')
       group by l.job_id, j.address, j.updated_at`,
      [userId],
    ),
    db.query<{ id: string; job_id: string; address: string; reason: string | null; created_at: Date }>(
      `select d.id, d.job_id, j.address, d.reason, d.created_at from disputes d join jobs j on j.id = d.job_id
       where j.trades_id = $1 and d.filed_at is null and coalesce(d.status,'') <> 'RESOLVED'`,
      [userId],
    ),
  ]);

  const items: InboxItem[] = [];
  for (const i of invites)
    items.push({ key: `inv-${i.id}`, kind: "invite", jobId: i.id, address: i.address, title: "New scope to review", detail: `${i.from} sent ${i.lines} line${i.lines === 1 ? "" : "s"} for your approval`, amountCents: i.totalCents, at: i.sentAt, rank: 1 });
  for (const a of approvals.rows) {
    const asHome = a.homeowner_id === userId;
    const asTrades = a.trades_id === userId;
    const have = new Set(a.approvals.map((x) => x.by));
    const needed = a.approver === "both" ? ["homeowner", "tradesperson"] : [a.approver];
    const mine = needed.filter((n) => (n === "homeowner" ? asHome : asTrades) && !have.has(n));
    if (!mine.length) continue;
    items.push({
      key: `apr-${a.id}`,
      kind: "guard_approval",
      jobId: a.job_id,
      address: a.address,
      title: "The guard is asking you first",
      detail: a.decision.reasons_plain[1] ?? a.decision.reasons_plain[0] ?? "A rule asked for your approval",
      amountCents: a.action.amount_cents || null,
      at: a.created_at.toISOString(),
      rank: 0,
    });
  }
  for (const j of jobs.rows) {
    if (j.status === "DRAFT" && j.trades_id === userId)
      items.push({ key: `draft-${j.id}`, kind: "finish_scope", jobId: j.id, address: j.address, title: "Finish the scope", detail: "Add before-photos and lines, then send it to your client", amountCents: j.total || null, at: j.updated_at.toISOString(), rank: 4 });
    if (j.status === "AWAITING_APPROVAL" && j.trades_id !== userId)
      items.push({ key: `hold-${j.id}`, kind: "approve_hold", jobId: j.id, address: j.address, title: "Approve the scope and hold the money", detail: "Nothing is charged until each line is proved", amountCents: j.total, at: j.updated_at.toISOString(), rank: 1 });
  }
  for (const r of review.rows)
    items.push({
      key: `rev-${r.job_id}`,
      kind: "review",
      jobId: r.job_id,
      address: r.address,
      title: `${r.n} line${r.n === 1 ? "" : "s"} to review`,
      detail: r.due ? "Verified lines release on their own when the review window ends" : "Approve or flag each proved line",
      amountCents: r.cents,
      at: r.last.toISOString(),
      rank: 2,
    });
  for (const p of prove.rows)
    items.push({
      key: `prv-${p.job_id}`,
      kind: "prove",
      jobId: p.job_id,
      address: p.address,
      title: p.failed ? `${p.failed} line${p.failed === 1 ? "" : "s"} to fix and re-prove` : `${p.n} line${p.n === 1 ? "" : "s"} to prove`,
      detail: "Open the camera on each line on site",
      amountCents: null,
      at: p.last.toISOString(),
      rank: 3,
    });
  for (const d of disputes.rows)
    items.push({ key: `dsp-${d.id}`, kind: "dispute", href: `/disputes/${d.id}`, jobId: d.job_id, address: d.address, title: "A dispute needs your evidence", detail: `${DISPUTE_REASON[d.reason ?? ""] ?? "Your client opened a PayPal dispute"}`, amountCents: null, at: d.created_at.toISOString(), rank: 0 });
  const covers = await coversFor([...new Set(items.map((i) => i.jobId))]);
  // An unopened scope isn't the person's job yet, so its photos aren't theirs to load.
  for (const i of items) i.coverUrl = i.kind === "invite" ? null : (covers.get(i.jobId) ?? null);
  return items.sort((a, b) => a.rank - b.rank || b.at.localeCompare(a.at));
}

export interface LedgerEntry {
  id: string;
  jobId: string;
  address: string;
  side: Side;
  kind: "hold" | "release";
  amountCents: number;
  status: string;
  paypalId: string | null;
  final: boolean;
  at: string;
  expiresAt: string | null;
}

/** Every hold and release on the user's jobs, newest first. */
export async function ledgerOf(userId: string): Promise<LedgerEntry[]> {
  const db = engine().db;
  const [holds, releases] = await Promise.all([
    db.query<{ id: string; job_id: string; address: string; trades_id: string; amount_cents: number; status: string; paypal_auth_id: string; created_at: Date; expires_at: Date | null }>(
      `select a.id, a.job_id, j.address, j.trades_id, a.amount_cents, a.status, a.paypal_auth_id, a.created_at, a.expires_at
       from authorizations a join jobs j on j.id = a.job_id where $1 in (j.trades_id, j.homeowner_id)`,
      [userId],
    ),
    db.query<{ id: string; job_id: string; address: string; trades_id: string; amount_cents: number; status: string; paypal_capture_id: string | null; final: boolean; created_at: Date }>(
      `select c.id, a.job_id, j.address, j.trades_id, c.amount_cents, c.status, c.paypal_capture_id, c.final, c.created_at
       from captures c join authorizations a on a.id = c.authorization_id join jobs j on j.id = a.job_id where $1 in (j.trades_id, j.homeowner_id)`,
      [userId],
    ),
  ]);
  const side = (t: string): Side => (t === userId ? "tradesperson" : "homeowner");
  return [
    ...holds.rows.map((h) => ({
      id: h.id,
      jobId: h.job_id,
      address: h.address,
      side: side(h.trades_id),
      kind: "hold" as const,
      amountCents: h.amount_cents,
      status: h.status,
      paypalId: h.paypal_auth_id,
      final: false,
      at: h.created_at.toISOString(),
      expiresAt: h.expires_at?.toISOString() ?? null,
    })),
    ...releases.rows.map((c) => ({
      id: c.id,
      jobId: c.job_id,
      address: c.address,
      side: side(c.trades_id),
      kind: "release" as const,
      amountCents: c.amount_cents,
      status: c.status,
      paypalId: c.paypal_capture_id,
      final: c.final,
      at: c.created_at.toISOString(),
      expiresAt: null,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}

export interface ActivityItem {
  id: number;
  jobId: string;
  address: string;
  actor: string;
  type: string;
  data: Record<string, unknown> | null;
  at: string;
}

export async function activityOf(userId: string, limit = 150): Promise<ActivityItem[]> {
  const { rows } = await engine().db.query<{ id: number; job_id: string; address: string; actor: string; type: string; data: Record<string, unknown> | null; at: Date }>(
    `select e.id, e.job_id, j.address, e.actor, e.type, e.data, e.at from events e join jobs j on j.id = e.job_id
     where $1 in (j.trades_id, j.homeowner_id) order by e.id desc limit $2`,
    [userId, limit],
  );
  return rows.map((r) => ({ id: Number(r.id), jobId: r.job_id, address: r.address, actor: r.actor, type: r.type, data: r.data, at: r.at.toISOString() }));
}

export interface DisputeItem {
  id: string;
  jobId: string;
  address: string;
  side: Side;
  paypalId: string;
  reason: string | null;
  status: string | null;
  filedAt: string | null;
  createdAt: string;
}

export async function disputesOf(userId: string): Promise<DisputeItem[]> {
  const { rows } = await engine().db.query<{ id: string; job_id: string; address: string; trades_id: string; paypal_dispute_id: string; reason: string | null; status: string | null; filed_at: Date | null; created_at: Date }>(
    `select d.id, d.job_id, j.address, j.trades_id, d.paypal_dispute_id, d.reason, d.status, d.filed_at, d.created_at
     from disputes d join jobs j on j.id = d.job_id where $1 in (j.trades_id, j.homeowner_id) order by d.created_at desc`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    jobId: r.job_id,
    address: r.address,
    side: r.trades_id === userId ? "tradesperson" : "homeowner",
    paypalId: r.paypal_dispute_id,
    reason: r.reason,
    status: r.status,
    filedAt: r.filed_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
  }));
}

export interface GuardSummary {
  allowed: number;
  asked: number;
  blocked: number;
  rules: number;
}

export async function guardSummaryOf(userId: string): Promise<GuardSummary> {
  const db = engine().db;
  const [d, r] = await Promise.all([
    db.query<{ outcome: string; n: number }>(
      `select d.outcome, count(*)::int8 as n from guard_decisions d join jobs j on j.id = d.job_id
       where $1 in (j.trades_id, j.homeowner_id) group by d.outcome`,
      [userId],
    ),
    db.query<{ n: number }>("select count(*)::int8 as n from guard_rules where owner_id = $1 and rule is not null and enabled", [userId]),
  ]);
  const by = Object.fromEntries(d.rows.map((x) => [x.outcome, Number(x.n)]));
  return { allowed: by.ALLOW ?? 0, asked: by.REQUIRE_APPROVAL ?? 0, blocked: by.DENY ?? 0, rules: Number(r.rows[0]?.n ?? 0) };
}

/** How many things are waiting on the user: the sidebar badge. */
export async function waitingCount(userId: string, email: string | null): Promise<number> {
  return (await inboxOf(userId, email)).length;
}
