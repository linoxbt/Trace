// Tripwire storage: the decision ledger, approval requests, people's rules and
// trust labels. Decisions are written before any money moves.

import type { Approver, Decision, MoneyAction, Outcome, Rule, TextScan, Trust } from "@trace/core";
import type { Queryable } from "./db.ts";

export interface DecisionRow {
  id: number;
  request_id: string;
  job_id: string;
  action: MoneyAction;
  decision: Decision;
  outcome: Outcome;
  executed: boolean;
  paypal_result: unknown;
  decided_at: Date;
}

export async function insertDecision(q: Queryable, action: MoneyAction, decision: Decision): Promise<DecisionRow> {
  const { rows } = await q.query<DecisionRow>(
    `insert into guard_decisions (request_id, job_id, action, decision, outcome) values ($1, $2, $3, $4, $5) returning *`,
    [action.request_id, action.job_id, JSON.stringify(action), JSON.stringify(decision), decision.outcome],
  );
  return rows[0]!;
}

/** The one permitted change to a decision: record that it ran, and what PayPal said. */
export async function markDecisionExecuted(q: Queryable, id: number, result: unknown): Promise<void> {
  await q.query("update guard_decisions set executed = true, paypal_result = $2 where id = $1 and not executed", [id, JSON.stringify(result ?? null)]);
}

export async function decisionsForRequest(q: Queryable, requestId: string): Promise<DecisionRow[]> {
  const { rows } = await q.query<DecisionRow>("select * from guard_decisions where request_id = $1 order by id", [requestId]);
  return rows;
}

export async function decisionsForJob(q: Queryable, jobId: string): Promise<DecisionRow[]> {
  const { rows } = await q.query<DecisionRow>("select * from guard_decisions where job_id = $1 order by id", [jobId]);
  return rows;
}

/**
 * Decisions on jobs the user is a party to, oldest first: the backtest's
 * history. With `side`, only jobs where they were on that side; with `jobId`, one job.
 */
export async function decisionsForUser(
  q: Queryable,
  userId: string,
  opts: { side?: "homeowner" | "tradesperson"; jobId?: string | null; limit?: number } = {},
): Promise<DecisionRow[]> {
  const { rows } = await q.query<DecisionRow>(
    `select d.* from guard_decisions d join jobs j on j.id = d.job_id
      where case $2::text when 'homeowner' then j.homeowner_id = $1 when 'tradesperson' then j.trades_id = $1
                          else $1 in (j.trades_id, j.homeowner_id) end
        and ($3::uuid is null or d.job_id = $3)
      order by d.id desc limit $4`,
    [userId, opts.side ?? null, opts.jobId ?? null, opts.limit ?? 500],
  );
  return rows.reverse();
}

// ---------- approvals ----------

export interface ApprovalEntry {
  by: "homeowner" | "tradesperson";
  at: string;
  event_id: number;
}

export interface ApprovalRow {
  id: string;
  decision_id: number;
  job_id: string;
  approver: Approver;
  status: "PENDING" | "APPROVED" | "DENIED" | "EXPIRED";
  approvals: ApprovalEntry[];
  expires_at: Date;
  created_at: Date;
}

export async function insertApproval(q: Queryable, a: { decisionId: number; jobId: string; approver: Approver; expiresAt: Date }): Promise<ApprovalRow> {
  const { rows } = await q.query<ApprovalRow>(
    "insert into approval_requests (decision_id, job_id, approver, expires_at) values ($1, $2, $3, $4) returning *",
    [a.decisionId, a.jobId, a.approver, a.expiresAt],
  );
  return rows[0]!;
}

export async function getApproval(q: Queryable, id: string, opts: { lock?: boolean } = {}): Promise<ApprovalRow | null> {
  const { rows } = await q.query<ApprovalRow>(`select * from approval_requests where id = $1${opts.lock ? " for update" : ""}`, [id]);
  return rows[0] ?? null;
}

export async function updateApproval(q: Queryable, id: string, patch: { status?: ApprovalRow["status"]; approvals?: ApprovalEntry[] }): Promise<ApprovalRow> {
  const { rows } = await q.query<ApprovalRow>(
    "update approval_requests set status = coalesce($2, status), approvals = coalesce($3, approvals) where id = $1 returning *",
    [id, patch.status ?? null, patch.approvals ? JSON.stringify(patch.approvals) : null],
  );
  return rows[0]!;
}

export async function approvalsForJob(q: Queryable, jobId: string): Promise<(ApprovalRow & { action: MoneyAction; decision: Decision })[]> {
  const { rows } = await q.query<ApprovalRow & { action: MoneyAction; decision: Decision }>(
    `select a.*, d.action, d.decision from approval_requests a join guard_decisions d on d.id = a.decision_id
      where a.job_id = $1 order by a.created_at`,
    [jobId],
  );
  return rows;
}

/** Pending approvals whose time ran out. */
export async function expiredApprovals(q: Queryable, now: Date): Promise<ApprovalRow[]> {
  const { rows } = await q.query<ApprovalRow>("select * from approval_requests where status = 'PENDING' and expires_at <= $1", [now]);
  return rows;
}

// ---------- rules ----------

export interface RuleRow {
  id: string;
  owner_id: string;
  owner_kind: "homeowner" | "tradesperson";
  scope: "job" | "account";
  job_id: string | null;
  preset: string | null;
  rule: Rule | null;
  english: string;
  readback: string;
  enabled: boolean;
  created_at: Date;
}

export async function rulesForOwners(q: Queryable, ownerIds: string[], jobId: string | null): Promise<RuleRow[]> {
  const { rows } = await q.query<RuleRow>(
    `select * from guard_rules where owner_id = any($1::uuid[]) and (scope = 'account' or job_id = $2) order by created_at`,
    [ownerIds, jobId],
  );
  return rows;
}

export async function insertRule(
  q: Queryable,
  r: { ownerId: string; ownerKind: "homeowner" | "tradesperson"; scope: "job" | "account"; jobId: string | null; rule: Rule },
): Promise<RuleRow> {
  const { rows } = await q.query<RuleRow>(
    `insert into guard_rules (owner_id, owner_kind, scope, job_id, rule, english, readback) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [r.ownerId, r.ownerKind, r.scope, r.jobId, JSON.stringify(r.rule), r.rule.english, r.rule.readback],
  );
  return rows[0]!;
}

/** Everything one person has set: their own rules and preset switches. */
export async function rulesOfOwner(q: Queryable, ownerId: string): Promise<RuleRow[]> {
  const { rows } = await q.query<RuleRow>("select * from guard_rules where owner_id = $1 order by created_at", [ownerId]);
  return rows;
}

export async function setRuleEnabled(q: Queryable, ownerId: string, id: string, enabled: boolean): Promise<RuleRow | null> {
  const { rows } = await q.query<RuleRow>("update guard_rules set enabled = $3 where id = $1 and owner_id = $2 returning *", [id, ownerId, enabled]);
  return rows[0] ?? null;
}

export async function deleteRule(q: Queryable, ownerId: string, id: string): Promise<boolean> {
  const res = await q.query("delete from guard_rules where id = $1 and owner_id = $2 and preset is null", [id, ownerId]);
  return (res.rowCount ?? 0) > 0;
}

/** Turn a built-in preset off or back on for one person. */
export async function setPreset(q: Queryable, ownerId: string, preset: string, english: string, enabled: boolean): Promise<void> {
  await q.query(
    `insert into guard_rules (owner_id, owner_kind, scope, preset, english, readback, enabled) values ($1, 'homeowner', 'account', $2, $3, $3, $4)
     on conflict (owner_id, preset) where preset is not null do update set enabled = excluded.enabled`,
    [ownerId, preset, english, enabled],
  );
}

// ---------- trust labels and proof scans ----------

export async function labelInput(q: Queryable, l: { ref: string; jobId: string; trust: Trust; parents?: string[] }): Promise<void> {
  await q.query(
    `insert into input_labels (ref, job_id, trust, parents) values ($1, $2, $3, $4)
     on conflict (ref) do update set trust = excluded.trust, parents = excluded.parents`,
    [l.ref, l.jobId, l.trust, l.parents ?? []],
  );
}

export async function labelsForJob(q: Queryable, jobId: string): Promise<{ ref: string; trust: Trust; parents: string[] }[]> {
  const { rows } = await q.query<{ ref: string; trust: Trust; parents: string[] }>("select ref, trust, parents from input_labels where job_id = $1 order by ref", [jobId]);
  return rows;
}

export async function setPhotoScan(q: Queryable, photoId: string, scan: TextScan, flagged: boolean): Promise<void> {
  await q.query("update photos set text_scan = $2, injection_flag = $3 where id = $1", [photoId, JSON.stringify(scan), flagged]);
}
