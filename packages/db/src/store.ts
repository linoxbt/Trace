// Row types and the queries the engine and the web app share. Every function
// takes a Queryable, so it runs inside a caller's transaction or on the pool.

import type { Acceptance, JobCategory, JobStatus, LineObservation, LineStatus, IntegrityReport, ProofSpec, ProofType, TextScan, Verdict } from "@trace/core";
import type { Queryable } from "./db.ts";

export type Actor = "tradesperson" | "homeowner" | "system" | "paypal";

export interface JobRow {
  id: string;
  trades_id: string;
  homeowner_id: string | null;
  homeowner_email: string;
  address: string;
  anchor_lat: number | null;
  anchor_lng: number | null;
  status: JobStatus;
  disputed: boolean;
  scope_hash: string | null;
  currency: string;
  review_window_s: number;
  paypal_order_id: string | null;
  trades_device_id: string | null;
  demo: boolean;
  close_drop_line_ids: string[] | null;
  close_trades_at: Date | null;
  close_homeowner_at: Date | null;
  /** Scope-time check: lines whose text speaks to the AI (Tripwire section 7). */
  scope_flags: { line: string; text: string; why: string }[] | null;
  /** The tradesperson's PayPal merchant ID, frozen when the order is created. Null pays Trace's own account (demo jobs). */
  payee_merchant_id: string | null;
  /** The kind of job: sets the words for each side and the starting lines. */
  category: JobCategory;
  created_at: Date;
  updated_at: Date;
}

export interface LineRow {
  id: string;
  job_id: string;
  code: string;
  title: string;
  description: string | null;
  price_cents: number;
  acceptance: Acceptance;
  verifiable_by_photo: boolean;
  status: LineStatus;
  capture_id: string | null;
  review_due_at: Date | null;
  flag_note: string | null;
  position: number;
  /** Tripwire: the latest proof had text addressed to the inspector. */
  injection_flag: boolean;
  injection_excerpt: string | null;
  /** How the line is proved, and the type's details (section 6.2). */
  proof_type: ProofType;
  proof_spec: ProofSpec | null;
}

export type AuthorizationStatus = "CREATED" | "PARTIALLY_CAPTURED" | "CAPTURED" | "VOIDED" | "DENIED" | "PENDING";

export interface AuthorizationRow {
  id: string;
  job_id: string;
  paypal_order_id: string;
  paypal_auth_id: string;
  amount_cents: number;
  currency: string;
  status: AuthorizationStatus;
  honor_until: Date | null;
  expires_at: Date | null;
  reauth_attempted_at: Date | null;
  kind: "base" | "change_order";
  created_at: Date;
}

export type CaptureStatus = "SENDING" | "COMPLETED" | "PENDING" | "DECLINED" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";

export interface CaptureRow {
  id: string;
  authorization_id: string;
  paypal_capture_id: string | null;
  request_id: string;
  invoice_id: string;
  amount_cents: number;
  final: boolean;
  line_ids: string[];
  status: CaptureStatus;
  attempts: number;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PhotoRow {
  id: string;
  job_id: string;
  line_id: string | null;
  kind: "before" | "after" | "during" | "masked";
  storage_path: string;
  dhash: string;
  lat: number | null;
  lng: number | null;
  gps_accuracy_m: number | null;
  capture_token: string | null;
  device_id: string | null;
  sample: boolean;
  taken_at: Date;
  integrity: IntegrityReport | null;
  /** Tripwire: what the proof text scan found, whether it was aimed at the reviewer, and the original of a masked copy. */
  text_scan: TextScan | null;
  injection_flag: boolean;
  masked_of: string | null;
}

export interface EventRow {
  id: number;
  job_id: string;
  actor: Actor;
  type: string;
  data: Record<string, unknown> | null;
  at: Date;
}

export interface DisputeRow {
  id: string;
  job_id: string;
  capture_id: string | null;
  paypal_dispute_id: string;
  reason: string | null;
  status: string | null;
  draft_notes: string | null;
  pdf_path: string | null;
  filed_at: Date | null;
}

/** Statuses whose money is committed or might be: they count against the authorization. */
export const LIVE_CAPTURE_STATUSES: CaptureStatus[] = ["SENDING", "COMPLETED", "PENDING", "REFUNDED", "PARTIALLY_REFUNDED"];

// ---------- profiles ----------

export async function upsertProfile(q: Queryable, p: { id: string; displayName: string; paypalEmail?: string | null }): Promise<void> {
  await q.query(
    `insert into profiles (id, display_name, paypal_email) values ($1, $2, $3)
     on conflict (id) do update set paypal_email = coalesce(excluded.paypal_email, profiles.paypal_email)`,
    [p.id, p.displayName, p.paypalEmail ?? null],
  );
}

/** What a person changes on their own Settings page. The sign-in name is only the starting value. */
export async function updateProfile(q: Queryable, id: string, p: { displayName?: string; paypalEmail?: string | null }): Promise<void> {
  await q.query(
    `update profiles set display_name = coalesce($2, display_name),
       paypal_email = case when $4 then $3 else paypal_email end where id = $1`,
    [id, p.displayName ?? null, p.paypalEmail ?? null, p.paypalEmail !== undefined],
  );
}

export interface PayeeRow {
  paypal_merchant_id: string | null;
  paypal_receivable: boolean;
  paypal_email_confirmed: boolean;
  paypal_permissions: boolean;
  paypal_checked_at: Date | null;
}

export async function getPayee(q: Queryable, userId: string): Promise<PayeeRow | null> {
  const { rows } = await q.query<PayeeRow>(
    "select paypal_merchant_id, paypal_receivable, paypal_email_confirmed, paypal_permissions, paypal_checked_at from profiles where id = $1",
    [userId],
  );
  return rows[0] ?? null;
}

/** Record what PayPal says about a person's linked account. A null merchant ID unlinks it. */
export async function setPayee(
  q: Queryable,
  userId: string,
  p: { merchantId: string | null; receivable: boolean; emailConfirmed: boolean; permissions: boolean },
): Promise<void> {
  // A merchant account links to one Trace profile; an older link to it is dropped.
  if (p.merchantId) await q.query("update profiles set paypal_merchant_id = null, paypal_receivable = false where paypal_merchant_id = $1 and id <> $2", [p.merchantId, userId]);
  await q.query(
    `update profiles set paypal_merchant_id = $2, paypal_receivable = $3, paypal_email_confirmed = $4,
       paypal_permissions = $5, paypal_checked_at = now() where id = $1`,
    [userId, p.merchantId, p.receivable, p.emailConfirmed, p.permissions],
  );
}

export async function profileIdByMerchant(q: Queryable, merchantId: string): Promise<string | null> {
  const { rows } = await q.query<{ id: string }>("select id from profiles where paypal_merchant_id = $1", [merchantId]);
  return rows[0]?.id ?? null;
}

// ---------- jobs ----------

export async function insertJob(
  q: Queryable,
  j: {
    tradesId: string;
    homeownerEmail: string;
    address: string;
    currency?: string;
    reviewWindowS?: number;
    deviceId?: string | null;
    demo?: boolean;
    homeownerId?: string | null;
    category?: JobCategory;
  },
): Promise<JobRow> {
  const { rows } = await q.query<JobRow>(
    `insert into jobs (trades_id, homeowner_email, address, currency, review_window_s, trades_device_id, demo, homeowner_id, category)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
    [j.tradesId, j.homeownerEmail.toLowerCase(), j.address, j.currency ?? "USD", j.reviewWindowS ?? 43_200, j.deviceId ?? null, j.demo ?? false, j.homeownerId ?? null, j.category ?? "home_repair"],
  );
  return rows[0]!;
}

export async function getJob(q: Queryable, id: string, opts: { lock?: boolean } = {}): Promise<JobRow | null> {
  const { rows } = await q.query<JobRow>(`select * from jobs where id = $1${opts.lock ? " for update" : ""}`, [id]);
  return rows[0] ?? null;
}

export async function mustGetJob(q: Queryable, id: string, opts: { lock?: boolean } = {}): Promise<JobRow> {
  const job = await getJob(q, id, opts);
  if (!job) throw new NotFound("job", id);
  return job;
}

export async function updateJob(
  q: Queryable,
  id: string,
  patch: Partial<Pick<JobRow, "status" | "disputed" | "scope_hash" | "paypal_order_id" | "anchor_lat" | "anchor_lng" | "homeowner_id" | "close_drop_line_ids" | "close_trades_at" | "close_homeowner_at" | "scope_flags" | "payee_merchant_id">>,
): Promise<JobRow> {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length === 0) return mustGetJob(q, id);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const { rows } = await q.query<JobRow>(
    `update jobs set ${sets.join(", ")}, updated_at = now() where id = $1 returning *`,
    // jsonb columns go in as JSON text; pg would send a JS array as a Postgres array.
    [id, ...keys.map((k) => (k === "scope_flags" && patch[k] ? JSON.stringify(patch[k]) : patch[k]))],
  );
  if (!rows[0]) throw new NotFound("job", id);
  return rows[0];
}

export async function getJobByOrderId(q: Queryable, orderId: string): Promise<JobRow | null> {
  const { rows } = await q.query<JobRow>("select * from jobs where paypal_order_id = $1", [orderId]);
  return rows[0] ?? null;
}

// ---------- lines ----------

export interface NewLine {
  code: string;
  title: string;
  description?: string | null;
  priceCents: number;
  acceptance: Acceptance;
  verifiableByPhoto: boolean;
  proofType?: ProofType;
  proofSpec?: ProofSpec | null;
}

/** Replace a draft job's lines. */
export async function replaceLines(q: Queryable, jobId: string, lines: readonly NewLine[]): Promise<LineRow[]> {
  await q.query("delete from lines where job_id = $1", [jobId]);
  const out: LineRow[] = [];
  for (const [i, l] of lines.entries()) {
    const { rows } = await q.query<LineRow>(
      `insert into lines (job_id, code, title, description, price_cents, acceptance, verifiable_by_photo, position, proof_type, proof_spec)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
      [jobId, l.code, l.title, l.description ?? null, l.priceCents, JSON.stringify(l.acceptance), l.verifiableByPhoto, i, l.proofType ?? "photo", l.proofSpec ? JSON.stringify(l.proofSpec) : null],
    );
    out.push(rows[0]!);
  }
  return out;
}

export async function getLines(q: Queryable, jobId: string, opts: { lock?: boolean } = {}): Promise<LineRow[]> {
  const { rows } = await q.query<LineRow>(
    `select * from lines where job_id = $1 order by position${opts.lock ? " for update" : ""}`,
    [jobId],
  );
  return rows;
}

export async function getLine(q: Queryable, id: string, opts: { lock?: boolean } = {}): Promise<LineRow | null> {
  const { rows } = await q.query<LineRow>(`select * from lines where id = $1${opts.lock ? " for update" : ""}`, [id]);
  return rows[0] ?? null;
}

export async function updateLine(
  q: Queryable,
  id: string,
  patch: Partial<Pick<LineRow, "status" | "capture_id" | "review_due_at" | "flag_note" | "injection_flag" | "injection_excerpt">>,
): Promise<LineRow> {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const { rows } = await q.query<LineRow>(
    `update lines set ${sets.join(", ")} where id = $1 returning *`,
    [id, ...keys.map((k) => patch[k])],
  );
  if (!rows[0]) throw new NotFound("line", id);
  return rows[0];
}

/** VERIFIED lines whose review window has lapsed, oldest first. */
export async function lapsedVerifiedLines(q: Queryable, now: Date, limit = 100): Promise<LineRow[]> {
  const { rows } = await q.query<LineRow>(
    `select * from lines where status = 'VERIFIED' and review_due_at is not null and review_due_at <= $1
     order by review_due_at limit $2`,
    [now, limit],
  );
  return rows;
}

// ---------- authorizations ----------

export async function insertAuthorization(
  q: Queryable,
  a: { jobId: string; orderId: string; authId: string; amountCents: number; currency: string; status: AuthorizationStatus; honorUntil: Date | null; expiresAt: Date | null },
): Promise<AuthorizationRow> {
  const { rows } = await q.query<AuthorizationRow>(
    `insert into authorizations (job_id, paypal_order_id, paypal_auth_id, amount_cents, currency, status, honor_until, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
    [a.jobId, a.orderId, a.authId, a.amountCents, a.currency, a.status, a.honorUntil, a.expiresAt],
  );
  return rows[0]!;
}

export async function getBaseAuthorization(q: Queryable, jobId: string, opts: { lock?: boolean } = {}): Promise<AuthorizationRow | null> {
  const { rows } = await q.query<AuthorizationRow>(
    `select * from authorizations where job_id = $1 and kind = 'base'${opts.lock ? " for update" : ""}`,
    [jobId],
  );
  return rows[0] ?? null;
}

export async function getAuthorizationByPayPalId(q: Queryable, paypalAuthId: string): Promise<AuthorizationRow | null> {
  const { rows } = await q.query<AuthorizationRow>("select * from authorizations where paypal_auth_id = $1", [paypalAuthId]);
  return rows[0] ?? null;
}

export async function updateAuthorization(
  q: Queryable,
  id: string,
  patch: Partial<Pick<AuthorizationRow, "status" | "paypal_auth_id" | "honor_until" | "expires_at" | "reauth_attempted_at">>,
): Promise<AuthorizationRow> {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const { rows } = await q.query<AuthorizationRow>(
    `update authorizations set ${sets.join(", ")}, updated_at = now() where id = $1 returning *`,
    [id, ...keys.map((k) => patch[k])],
  );
  if (!rows[0]) throw new NotFound("authorization", id);
  return rows[0];
}

/** Open authorizations past their honor period that were never reauthorized and still have open lines. */
export async function authorizationsToReauthorize(q: Queryable, now: Date): Promise<AuthorizationRow[]> {
  const { rows } = await q.query<AuthorizationRow>(
    `select a.* from authorizations a join jobs j on j.id = a.job_id
     where a.status in ('CREATED','PARTIALLY_CAPTURED') and a.reauth_attempted_at is null
       and a.honor_until is not null and a.honor_until <= $1
       and j.status in ('AUTHORIZED','IN_PROGRESS','PARTIALLY_RELEASED')
       and exists (select 1 from lines l where l.job_id = a.job_id and l.status not in ('CAPTURED','DROPPED'))
     order by a.honor_until`,
    [now],
  );
  return rows;
}

// ---------- captures ----------

export async function capturedCents(q: Queryable, authorizationId: string): Promise<number> {
  const { rows } = await q.query<{ n: number }>(
    `select coalesce(sum(amount_cents), 0)::int8 as n from captures where authorization_id = $1 and status = any($2)`,
    [authorizationId, LIVE_CAPTURE_STATUSES],
  );
  return rows[0]!.n;
}

export async function countCaptures(q: Queryable, authorizationId: string): Promise<number> {
  const { rows } = await q.query<{ n: number }>("select count(*)::int8 as n from captures where authorization_id = $1", [authorizationId]);
  return rows[0]!.n;
}

export async function insertCapture(
  q: Queryable,
  c: { authorizationId: string; requestId: string; invoiceId: string; amountCents: number; final: boolean; lineIds: string[] },
): Promise<CaptureRow> {
  const { rows } = await q.query<CaptureRow>(
    `insert into captures (authorization_id, request_id, invoice_id, amount_cents, final, line_ids, status)
     values ($1, $2, $3, $4, $5, $6, 'SENDING') returning *`,
    [c.authorizationId, c.requestId, c.invoiceId, c.amountCents, c.final, c.lineIds],
  );
  return rows[0]!;
}

export async function getCapture(q: Queryable, id: string, opts: { lock?: boolean } = {}): Promise<CaptureRow | null> {
  const { rows } = await q.query<CaptureRow>(`select * from captures where id = $1${opts.lock ? " for update" : ""}`, [id]);
  return rows[0] ?? null;
}

/** The job a capture belongs to, so a transaction can lock the job before the capture. */
export async function jobIdOfCapture(q: Queryable, captureId: string): Promise<string | null> {
  const { rows } = await q.query<{ job_id: string }>(
    "select a.job_id from captures c join authorizations a on a.id = c.authorization_id where c.id = $1",
    [captureId],
  );
  return rows[0]?.job_id ?? null;
}

export async function getCaptureByPayPalId(q: Queryable, paypalCaptureId: string): Promise<CaptureRow | null> {
  const { rows } = await q.query<CaptureRow>("select * from captures where paypal_capture_id = $1", [paypalCaptureId]);
  return rows[0] ?? null;
}

export async function getCaptureByInvoiceId(q: Queryable, invoiceId: string): Promise<CaptureRow | null> {
  const { rows } = await q.query<CaptureRow>("select * from captures where invoice_id = $1", [invoiceId]);
  return rows[0] ?? null;
}

export async function updateCapture(
  q: Queryable,
  id: string,
  patch: Partial<Pick<CaptureRow, "status" | "paypal_capture_id" | "last_error">> & { bumpAttempts?: boolean },
): Promise<CaptureRow> {
  const { bumpAttempts, ...fields } = patch;
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  if (bumpAttempts) sets.push("attempts = attempts + 1");
  const { rows } = await q.query<CaptureRow>(
    `update captures set ${[...sets, "updated_at = now()"].join(", ")} where id = $1 returning *`,
    [id, ...keys.map((k) => fields[k])],
  );
  if (!rows[0]) throw new NotFound("capture", id);
  return rows[0];
}

/**
 * Captures whose PayPal answer is still unknown, untouched for at least
 * `staleS` seconds. Measured on the database clock, which wrote updated_at.
 */
export async function sendingCaptures(q: Queryable, staleS: number): Promise<CaptureRow[]> {
  const { rows } = await q.query<CaptureRow>(
    `select * from captures where status = 'SENDING' and updated_at <= now() - make_interval(secs => $1) order by created_at`,
    [staleS],
  );
  return rows;
}

// ---------- photos and capture tokens ----------

export async function insertPhoto(
  q: Queryable,
  p: Omit<PhotoRow, "id" | "integrity" | "text_scan" | "injection_flag" | "masked_of"> & { id?: string; integrity?: IntegrityReport | null; masked_of?: string | null },
): Promise<PhotoRow> {
  const { rows } = await q.query<PhotoRow>(
    `insert into photos (id, job_id, line_id, kind, storage_path, dhash, lat, lng, gps_accuracy_m, capture_token, device_id, sample, taken_at, integrity, masked_of)
     values (coalesce($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) returning *`,
    [p.id ?? null, p.job_id, p.line_id, p.kind, p.storage_path, p.dhash, p.lat, p.lng, p.gps_accuracy_m, p.capture_token, p.device_id, p.sample, p.taken_at, p.integrity ? JSON.stringify(p.integrity) : null, p.masked_of ?? null],
  );
  return rows[0]!;
}

export async function getPhotos(q: Queryable, jobId: string): Promise<PhotoRow[]> {
  const { rows } = await q.query<PhotoRow>("select * from photos where job_id = $1 order by taken_at", [jobId]);
  return rows;
}

/** The before-photo a line was scoped from: its own, else the job's first. */
export async function beforePhotoFor(q: Queryable, line: Pick<LineRow, "id" | "job_id">): Promise<PhotoRow | null> {
  const { rows } = await q.query<PhotoRow>(
    `select * from photos where job_id = $1 and kind = 'before' and (line_id = $2 or line_id is null)
     order by (line_id = $2) desc nulls last, taken_at limit 1`,
    [line.job_id, line.id],
  );
  return rows[0] ?? null;
}

/**
 * Smallest Hamming distance from `dhash` to any stored photo other than the
 * line's own before-photos. With `jobId`, only that job's photos: every demo
 * copy holds the same sample photos, so a sample is only "reused" within its job.
 */
export async function nearestOtherHamming(q: Queryable, dhash: string, excludePhotoIds: string[], opts: { jobId?: string } = {}): Promise<number | null> {
  const { rows } = await q.query<{ d: number | null }>(
    `select min(bit_count(('x' || dhash)::bit(64) # ('x' || $1)::bit(64)))::int8 as d
     from photos where kind <> 'masked' and not (id = any($2::uuid[])) and ($3::uuid is null or job_id = $3)`,
    [dhash, excludePhotoIds, opts.jobId ?? null],
  );
  return rows[0]?.d ?? null;
}

export async function issueCaptureToken(q: Queryable, t: { token: string; lineId: string; issuedTo: string; deviceId: string | null; now: Date }): Promise<void> {
  await q.query(
    "insert into capture_tokens (token, line_id, issued_to, device_id, issued_at) values ($1, $2, $3, $4, $5)",
    [t.token, t.lineId, t.issuedTo, t.deviceId, t.now],
  );
}

/** Spend a token: true only for an unused token for this line and person, issued no more than ttlS ago. */
export async function consumeCaptureToken(q: Queryable, t: { token: string; lineId: string; userId: string; now: Date; ttlS: number }): Promise<boolean> {
  const { rowCount } = await q.query(
    `update capture_tokens set used_at = $4
     where token = $1 and line_id = $2 and issued_to = $3 and used_at is null
       and issued_at <= $4 and issued_at >= $4 - make_interval(secs => $5)`,
    [t.token, t.lineId, t.userId, t.now, t.ttlS],
  );
  return rowCount === 1;
}

// ---------- verdicts ----------

export async function insertVerdict(
  q: Queryable,
  v: {
    lineId: string;
    /** The photo judged, or for other proof types the proof item. */
    photoId: string | null;
    proofItemId?: string | null;
    /** A LineObservation, plus what an adapter extracted (a reading's value, a document's fields). */
    observation: LineObservation & { extracted?: unknown; instructions_found?: string | null };
    verdict: Verdict;
    reasons: string[];
    model: string;
    pass: number;
    masked?: boolean;
  },
): Promise<string> {
  const { rows } = await q.query<{ id: string }>(
    `insert into verdicts (line_id, photo_id, observation, verdict, reasons, model, pass, masked, proof_item_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [v.lineId, v.photoId, JSON.stringify(v.observation), v.verdict, JSON.stringify(v.reasons), v.model, v.pass, !!v.masked, v.proofItemId ?? null],
  );
  return rows[0]!.id;
}

// ---------- proof items and attestations ----------

export interface ProofItemRow {
  id: string;
  job_id: string;
  line_id: string;
  kind: "video_frame" | "document" | "file" | "url" | "attestation";
  storage_path: string | null;
  sha256: string | null;
  meta: Record<string, unknown>;
  sample: boolean;
  created_at: Date;
}

export async function insertProofItem(
  q: Queryable,
  p: { jobId: string; lineId: string; kind: ProofItemRow["kind"]; storagePath?: string | null; sha256?: string | null; meta?: Record<string, unknown>; sample?: boolean },
): Promise<ProofItemRow> {
  const { rows } = await q.query<ProofItemRow>(
    `insert into proof_items (job_id, line_id, kind, storage_path, sha256, meta, sample) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [p.jobId, p.lineId, p.kind, p.storagePath ?? null, p.sha256 ?? null, JSON.stringify(p.meta ?? {}), !!p.sample],
  );
  return rows[0]!;
}

/** Has this exact file been used as proof on any other line? */
export async function sha256UsedElsewhere(q: Queryable, sha256: string, lineId: string): Promise<boolean> {
  const { rowCount } = await q.query("select 1 from proof_items where sha256 = $1 and line_id <> $2 limit 1", [sha256, lineId]);
  return (rowCount ?? 0) > 0;
}

export async function latestProofItems(q: Queryable, lineId: string): Promise<ProofItemRow[]> {
  const { rows } = await q.query<ProofItemRow>(
    `select * from proof_items where line_id = $1 and created_at >= coalesce((select max(created_at) from proof_items where line_id = $1 and kind <> 'video_frame'), '-infinity'::timestamptz) - interval '1 minute' order by created_at, id`,
    [lineId],
  );
  return rows;
}

export interface AttestationRow {
  id: string;
  line_id: string;
  token_hash: string;
  email: string;
  statement: string;
  signed_name: string | null;
  signed_at: Date | null;
  signed_ip: string | null;
  expires_at: Date;
  created_at: Date;
}

// ---------- disputes ----------

export async function upsertDispute(
  q: Queryable,
  d: { jobId: string; captureId: string | null; paypalDisputeId: string; reason: string | null; status: string | null },
): Promise<{ row: DisputeRow; created: boolean }> {
  const { rows } = await q.query<DisputeRow & { created: boolean }>(
    `insert into disputes (job_id, capture_id, paypal_dispute_id, reason, status) values ($1, $2, $3, $4, $5)
     on conflict (paypal_dispute_id) do update set status = coalesce(excluded.status, disputes.status),
       reason = coalesce(excluded.reason, disputes.reason), updated_at = now()
     returning *, (xmax = 0) as created`,
    [d.jobId, d.captureId, d.paypalDisputeId, d.reason, d.status],
  );
  const { created, ...row } = rows[0]!;
  return { row, created };
}

// ---------- events ----------

export async function appendEvent(q: Queryable, e: { jobId: string; actor: Actor; type: string; data?: Record<string, unknown> }): Promise<number> {
  const { rows } = await q.query<{ id: number }>("insert into events (job_id, actor, type, data) values ($1, $2, $3, $4) returning id", [
    e.jobId,
    e.actor,
    e.type,
    e.data ? JSON.stringify(e.data) : null,
  ]);
  return rows[0]!.id;
}

export async function getEvents(q: Queryable, jobId: string): Promise<EventRow[]> {
  const { rows } = await q.query<EventRow>("select * from events where job_id = $1 order by id", [jobId]);
  return rows;
}

// ---------- webhook events ----------

/** Record a webhook; false when this event ID was already processed. */
export async function claimWebhookEvent(q: Queryable, e: { id: string; type: string; payload: unknown }): Promise<boolean> {
  await q.query(
    `insert into webhook_events (paypal_event_id, type, payload) values ($1, $2, $3) on conflict (paypal_event_id) do nothing`,
    [e.id, e.type, JSON.stringify(e.payload)],
  );
  const { rows } = await q.query<{ processed_at: Date | null }>(
    "select processed_at from webhook_events where paypal_event_id = $1 for update",
    [e.id],
  );
  return rows[0]?.processed_at == null;
}

export async function finishWebhookEvent(q: Queryable, id: string, error: string | null): Promise<void> {
  await q.query(
    `update webhook_events set processed_at = case when $2::text is null then now() else null end, error = $2 where paypal_event_id = $1`,
    [id, error],
  );
}

export class NotFound extends Error {
  constructor(readonly what: string, readonly id: string) {
    super(`${what} ${id} not found`);
    this.name = "NotFound";
  }
}
