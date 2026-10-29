// Tripwire (add-on spec): every money move is described as a MoneyAction and
// decided by code. Models can propose, explain and compile rules; they never
// make the allow or deny call. Everything here is pure: no I/O, no model.

import { z } from "zod";
import { formatMoney } from "./money.ts";

// ---------- the action envelope ----------

export const MoneyActionType = z.enum(["CAPTURE", "FINAL_CAPTURE", "VOID", "REAUTHORIZE", "REFUND", "FILE_EVIDENCE"]);
export type MoneyActionType = z.infer<typeof MoneyActionType>;

export const Trust = z.enum(["system", "homeowner", "tradesperson", "untrusted_content", "ai_output"]);
export type Trust = z.infer<typeof Trust>;

export const InitiatorKind = z.enum(["homeowner", "tradesperson", "worker", "agent"]);
export type InitiatorKind = z.infer<typeof InitiatorKind>;

export const MoneyAction = z.object({
  request_id: z.string().min(1), // reused as the PayPal-Request-Id
  type: MoneyActionType,
  job_id: z.uuid(),
  authorization_id: z.uuid().optional(), // our row, when there is one
  paypal_authorization_id: z.string().optional(), // PayPal's id, for actions on a hold
  capture_id: z.string().optional(), // REFUND only
  dispute_id: z.string().optional(), // FILE_EVIDENCE only
  line_ids: z.array(z.uuid()),
  amount_cents: z.number().int().nonnegative(), // computed on the server, never taken from a client
  final: z.boolean().optional(), // capture actions: final_capture flag
  initiator: z.object({
    kind: InitiatorKind,
    user_id: z.uuid().optional(),
    device_id: z.string().optional(),
  }),
  provenance: z.object({
    verdict_ids: z.array(z.uuid()),
    approval_event_ids: z.array(z.number().int()),
    inputs: z.array(z.object({ ref: z.string(), trust: Trust })),
  }),
});
export type MoneyAction = z.infer<typeof MoneyAction>;

export const CAPTURE_TYPES: MoneyActionType[] = ["CAPTURE", "FINAL_CAPTURE"];
/** Actions on the hold itself; B4 checks the hold is live for these. */
export const HOLD_TYPES: MoneyActionType[] = ["CAPTURE", "FINAL_CAPTURE", "VOID", "REAUTHORIZE"];

// ---------- facts: what the guard knew when it decided ----------

/**
 * One snapshot per decision, from live PayPal and the database (pre-flight).
 * Saved with the decision, so a backtest replays exactly what was known.
 */
export const Facts = z.object({
  auth_status: z.string().nullable(),
  auth_amount_cents: z.number().int(),
  captured_cents: z.number().int(),
  auth_remaining_cents: z.number().int(),
  dispute_open: z.boolean(),
  /** line id -> status, for the action's lines. */
  line_states: z.record(z.string(), z.string()),
  lines_max_price_cents: z.number().int(),
  verdict_min_confidence: z.number().nullable(),
  verdict_any_second_pass: z.boolean(),
  /** Lines in the action whose proof had text aimed at the reviewer. */
  injection_lines: z.array(z.string()),
  /** Of those, the ones the homeowner hasn't explicitly approved. */
  injection_unapproved_lines: z.array(z.string()),
  /** Approved lines on the job not yet captured (B9). */
  approved_uncaptured_count: z.number().int(),
  /** Released in the last 24 hours, including this action. */
  released_24h_cents: z.number().int(),
  /** Releases in the last 10 minutes, including this action. */
  releases_10m_count: z.number().int(),
  hours_since_authorization: z.number().nullable(),
  device_changed: z.boolean(),
  /** This request id was used before for a different payload (B11). */
  request_reused: z.boolean(),
  /** Who has explicitly approved this exact action. */
  approved_by: z.object({ homeowner: z.boolean(), tradesperson: z.boolean() }),
});
export type Facts = z.infer<typeof Facts>;

// ---------- rules ----------

export const ConditionField = z.enum([
  "action.amount_cents",
  "action.type",
  "action.initiator.kind",
  "lines.max_price_cents",
  "verdict.min_confidence",
  "verdict.any_second_pass",
  "injection.flagged",
  "facts.released_24h_cents",
  "facts.releases_10m_count",
  "facts.hours_since_authorization",
  "facts.auth_remaining_cents",
  "facts.device_changed",
  "facts.dispute_open",
]);
export type ConditionField = z.infer<typeof ConditionField>;

export const Condition = z.object({
  field: ConditionField,
  op: z.enum(["gt", "gte", "lt", "lte", "eq", "neq", "in"]),
  value: z.union([z.number(), z.string(), z.boolean(), z.array(z.string())]),
});
export type Condition = z.infer<typeof Condition>;

export const Approver = z.enum(["homeowner", "tradesperson", "both"]);
export type Approver = z.infer<typeof Approver>;

export const Rule = z.object({
  id: z.string(),
  owner: z.enum(["system", "homeowner", "tradesperson"]),
  scope: z.enum(["job", "account"]),
  applies_to: z.array(MoneyActionType).min(1),
  when: z.array(Condition).min(1), // all must hold
  // Rules people write can only tighten: never allow.
  effect: z.enum(["require_approval", "deny"]),
  approver: Approver.optional(),
  english: z.string().max(300),
  readback: z.string().max(400),
});
export type Rule = z.infer<typeof Rule>;

export const RuleHit = z.object({
  rule_id: z.string(),
  effect: z.enum(["allow", "require_approval", "deny"]),
  approver: Approver.optional(),
  why: z.string(),
  /** A require_approval hit the right people have already approved. */
  satisfied: z.boolean().optional(),
});
export type RuleHit = z.infer<typeof RuleHit>;

export const Outcome = z.enum(["ALLOW", "REQUIRE_APPROVAL", "DENY"]);
export type Outcome = z.infer<typeof Outcome>;

export const Decision = z.object({
  request_id: z.string(),
  outcome: Outcome,
  rule_hits: z.array(RuleHit),
  facts: Facts,
  injection: z.object({ flagged: z.boolean(), proof_ids: z.array(z.string()), excerpt: z.string().optional() }),
  approver: Approver.optional(),
  reasons_plain: z.array(z.string()),
  decided_at: z.string(),
});
export type Decision = z.infer<typeof Decision>;

// ---------- built-in rules (can't be removed) ----------

export interface BuiltinRule {
  id: string;
  label: string;
  check(action: MoneyAction, facts: Facts): Omit<RuleHit, "rule_id" | "satisfied"> | null;
}

const money = (c: number) => formatMoney(c);

export const BUILTIN_RULES: BuiltinRule[] = [
  {
    id: "B1",
    label: "Never capture more than is left on the hold",
    check: (a, f) =>
      CAPTURE_TYPES.includes(a.type) && a.amount_cents > f.auth_remaining_cents
        ? { effect: "deny", why: `${money(a.amount_cents)} is more than the ${money(Math.max(0, f.auth_remaining_cents))} left on the hold` }
        : null,
  },
  {
    id: "B2",
    label: "Only approved lines can be paid",
    check: (a, f) => {
      if (!CAPTURE_TYPES.includes(a.type)) return null;
      const bad = a.line_ids.filter((id) => f.line_states[id] !== "APPROVED");
      return bad.length ? { effect: "deny", why: `${bad.length} line${bad.length > 1 ? "s aren't" : " isn't"} approved` } : null;
    },
  },
  {
    id: "B3",
    label: "Nothing moves while a dispute is open",
    check: (a, f) =>
      ["CAPTURE", "FINAL_CAPTURE", "VOID", "REFUND"].includes(a.type) && f.dispute_open ? { effect: "deny", why: "a dispute is open on this job" } : null,
  },
  {
    id: "B4",
    label: "The hold must be live at PayPal",
    check: (a, f) =>
      HOLD_TYPES.includes(a.type) && f.auth_status !== "CREATED" && f.auth_status !== "PARTIALLY_CAPTURED"
        ? { effect: "deny", why: `the hold is ${f.auth_status ? f.auth_status.toLowerCase().replace(/_/g, " ") : "missing"} at PayPal` }
        : null,
  },
  {
    id: "B5",
    label: "Text aimed at the inspector needs the homeowner's OK",
    check: (a, f) =>
      CAPTURE_TYPES.includes(a.type) && f.injection_unapproved_lines.length
        ? { effect: "require_approval", approver: "homeowner", why: "a proof photo had text addressed to the inspector" }
        : null,
  },
  {
    id: "B6",
    label: "AI agents never move money",
    check: (a) => (a.initiator.kind === "agent" ? { effect: "deny", why: "agents can draft, but never move money" } : null),
  },
  {
    id: "B7",
    label: "Only the tradesperson files evidence",
    check: (a) =>
      a.type === "FILE_EVIDENCE" && a.initiator.kind !== "tradesperson" ? { effect: "deny", why: "only the tradesperson can file dispute evidence" } : null,
  },
  {
    id: "B8",
    label: "Refunds need both sides",
    check: (a) => (a.type === "REFUND" ? { effect: "require_approval", approver: "both", why: "a refund needs both sides to agree" } : null),
  },
  {
    id: "B9",
    label: "Voiding with approved work unpaid needs both sides",
    check: (a, f) =>
      a.type === "VOID" && f.approved_uncaptured_count > 0
        ? { effect: "require_approval", approver: "both", why: `${f.approved_uncaptured_count} approved line${f.approved_uncaptured_count > 1 ? "s are" : " is"} still unpaid` }
        : null,
  },
  {
    id: "B10",
    label: "Proof from a new phone needs the homeowner's OK",
    check: (a, f) =>
      CAPTURE_TYPES.includes(a.type) && f.device_changed
        ? { effect: "require_approval", approver: "homeowner", why: "a proof photo came from a different phone than the one that started the job" }
        : null,
  },
  {
    id: "B11",
    label: "A request id is never reused for something else",
    check: (_a, f) => (f.request_reused ? { effect: "deny", why: "this request id was already used for a different action" } : null),
  },
];

// ---------- presets: user rules, on by default ----------

const PRESET_BASE = { owner: "homeowner" as const, scope: "account" as const, applies_to: ["CAPTURE", "FINAL_CAPTURE"] as MoneyActionType[], effect: "require_approval" as const, approver: "homeowner" as const };

export const PRESET_RULES: Rule[] = [
  {
    ...PRESET_BASE,
    id: "P1",
    when: [
      { field: "action.amount_cents", op: "gt", value: 15000 },
      { field: "action.initiator.kind", op: "neq", value: "homeowner" },
    ],
    english: "Releases over $150 need my tap, unless I started them.",
    readback: "When a release over $150.00 wasn't started by the homeowner, ask the homeowner first.",
  },
  {
    ...PRESET_BASE,
    id: "P2",
    when: [
      { field: "facts.released_24h_cents", op: "gt", value: 30000 },
      { field: "action.initiator.kind", op: "neq", value: "homeowner" },
    ],
    english: "No more than $300 released in 24 hours without my tap.",
    readback: "When more than $300.00 would go out within 24 hours, and the homeowner didn't start the release, ask the homeowner first.",
  },
  {
    ...PRESET_BASE,
    id: "P3",
    when: [{ field: "facts.releases_10m_count", op: "gt", value: 3 }],
    english: "More than 3 releases within 10 minutes need my tap.",
    readback: "When this would be the 4th or later release within 10 minutes, ask the homeowner first.",
  },
];

// ---------- evaluation ----------

type Value = number | string | boolean | null;

export function fieldValue(field: ConditionField, a: MoneyAction, f: Facts): Value {
  switch (field) {
    case "action.amount_cents":
      return a.amount_cents;
    case "action.type":
      return a.type;
    case "action.initiator.kind":
      return a.initiator.kind;
    case "lines.max_price_cents":
      return f.lines_max_price_cents;
    case "verdict.min_confidence":
      return f.verdict_min_confidence;
    case "verdict.any_second_pass":
      return f.verdict_any_second_pass;
    case "injection.flagged":
      return f.injection_lines.length > 0;
    case "facts.released_24h_cents":
      return f.released_24h_cents;
    case "facts.releases_10m_count":
      return f.releases_10m_count;
    case "facts.hours_since_authorization":
      return f.hours_since_authorization;
    case "facts.auth_remaining_cents":
      return f.auth_remaining_cents;
    case "facts.device_changed":
      return f.device_changed;
    case "facts.dispute_open":
      return f.dispute_open;
  }
}

/** A missing value (null) never satisfies a condition. */
export function conditionHolds(c: Condition, a: MoneyAction, f: Facts): boolean {
  const v = fieldValue(c.field, a, f);
  if (v === null) return false;
  switch (c.op) {
    case "gt":
      return typeof v === "number" && typeof c.value === "number" && v > c.value;
    case "gte":
      return typeof v === "number" && typeof c.value === "number" && v >= c.value;
    case "lt":
      return typeof v === "number" && typeof c.value === "number" && v < c.value;
    case "lte":
      return typeof v === "number" && typeof c.value === "number" && v <= c.value;
    case "eq":
      return v === c.value;
    case "neq":
      return v !== c.value;
    case "in":
      return Array.isArray(c.value) && c.value.includes(String(v));
  }
}

const NUMBER_FIELDS: ConditionField[] = [
  "action.amount_cents",
  "lines.max_price_cents",
  "verdict.min_confidence",
  "facts.released_24h_cents",
  "facts.releases_10m_count",
  "facts.hours_since_authorization",
  "facts.auth_remaining_cents",
];
const BOOLEAN_FIELDS: ConditionField[] = ["verdict.any_second_pass", "injection.flagged", "facts.device_changed", "facts.dispute_open"];
const ENUM_FIELDS: Partial<Record<ConditionField, readonly string[]>> = {
  "action.type": MoneyActionType.options,
  "action.initiator.kind": InitiatorKind.options,
};

/**
 * What is wrong with a rule someone wrote, in plain words; empty when it can
 * be saved. Each condition's value has to fit its field, so a rule can't
 * quietly never fire because of a type mix-up.
 */
export function ruleProblems(rule: Rule): string[] {
  const out: string[] = [];
  if (rule.effect !== "deny" && rule.effect !== "require_approval") out.push("a rule can only ask first or block");
  for (const c of rule.when) {
    const v = c.value;
    if (NUMBER_FIELDS.includes(c.field)) {
      if (typeof v !== "number" || !Number.isFinite(v) || c.op === "in") out.push(`${c.field} needs a number`);
      else if (c.field === "verdict.min_confidence" && (v < 0 || v > 1)) out.push("confidence is between 0 and 1");
      else if (v < 0) out.push(`${c.field} can't be negative`);
    } else if (BOOLEAN_FIELDS.includes(c.field)) {
      if (typeof v !== "boolean" || (c.op !== "eq" && c.op !== "neq")) out.push(`${c.field} is yes or no`);
    } else {
      const allowed = ENUM_FIELDS[c.field] ?? [];
      const values = Array.isArray(v) ? v : [v];
      if (!["eq", "neq", "in"].includes(c.op) || (c.op === "in") !== Array.isArray(v)) out.push(`${c.field} compares with eq, neq or in`);
      else if (values.length === 0 || values.some((x) => typeof x !== "string" || !allowed.includes(x))) out.push(`${c.field} must be one of ${allowed.join(", ")}`);
    }
  }
  return out;
}

export function ruleMatches(rule: Rule, a: MoneyAction, f: Facts): boolean {
  return rule.applies_to.includes(a.type) && rule.when.every((c) => conditionHolds(c, a, f));
}

function approvedBy(approver: Approver | undefined, f: Facts): boolean {
  if (approver === "both") return f.approved_by.homeowner && f.approved_by.tradesperson;
  if (approver === "tradesperson") return f.approved_by.tradesperson;
  return f.approved_by.homeowner; // default approver is the homeowner
}

function mergeApprovers(list: (Approver | undefined)[]): Approver | undefined {
  let home = false;
  let trades = false;
  for (const a of list) {
    if (a === "both") home = trades = true;
    else if (a === "tradesperson") trades = true;
    else home = true;
  }
  if (!home && !trades) return undefined;
  return home && trades ? "both" : home ? "homeowner" : "tradesperson";
}

export interface Evaluation {
  outcome: Outcome;
  hits: RuleHit[];
  approver?: Approver;
}

/**
 * Built-in rules first, then user rules. Deny beats require-approval, which
 * beats allow; a require-approval hit the right people already approved
 * doesn't block. No match means allow: the built-ins cover the unsafe defaults.
 */
export function evaluate(a: MoneyAction, f: Facts, userRules: Rule[] = []): Evaluation {
  const hits: RuleHit[] = [];
  for (const b of BUILTIN_RULES) {
    const h = b.check(a, f);
    if (h) hits.push({ rule_id: b.id, ...h });
  }
  for (const r of userRules) {
    // Defence in depth: a stored rule that somehow says "allow" is ignored.
    if (r.effect !== "deny" && r.effect !== "require_approval") continue;
    if (ruleMatches(r, a, f)) hits.push({ rule_id: r.id, effect: r.effect, approver: r.effect === "require_approval" ? (r.approver ?? "homeowner") : undefined, why: r.english });
  }
  for (const h of hits) if (h.effect === "require_approval") h.satisfied = approvedBy(h.approver, f);

  if (hits.some((h) => h.effect === "deny")) return { outcome: "DENY", hits };
  const pending = hits.filter((h) => h.effect === "require_approval" && !h.satisfied);
  if (pending.length) return { outcome: "REQUIRE_APPROVAL", hits, approver: mergeApprovers(pending.map((h) => h.approver)) };
  return { outcome: "ALLOW", hits };
}

// ---------- plain words ----------

const ACTION_WORDS: Record<MoneyActionType, string> = {
  CAPTURE: "Release",
  FINAL_CAPTURE: "Final release",
  VOID: "Release of the hold",
  REAUTHORIZE: "Renewal of the hold",
  REFUND: "Refund",
  FILE_EVIDENCE: "Evidence filing",
};

/** The sentences the job timeline and the approval card show. */
export function plainReasons(a: MoneyAction, f: Facts, ev: Evaluation): string[] {
  const what = `${ACTION_WORDS[a.type]}${a.amount_cents ? ` of ${money(a.amount_cents)}` : ""}`;
  if (ev.outcome === "DENY") {
    return [`${what} blocked.`, ...ev.hits.filter((h) => h.effect === "deny").map((h) => cap(h.why) + ".")];
  }
  if (ev.outcome === "REQUIRE_APPROVAL") {
    const who = ev.approver === "both" ? "both of you" : `the ${ev.approver ?? "homeowner"}`;
    return [`${what} is waiting for ${who}.`, ...ev.hits.filter((h) => h.effect === "require_approval" && !h.satisfied).map((h) => cap(h.why) + ".")];
  }
  const parts: string[] = [];
  if (CAPTURE_TYPES.includes(a.type)) parts.push(`${a.line_ids.length} line${a.line_ids.length === 1 ? "" : "s"} approved`);
  if (!f.dispute_open) parts.push("no open disputes");
  if (HOLD_TYPES.includes(a.type) && f.auth_status) parts.push(`${money(Math.max(0, f.auth_remaining_cents - (CAPTURE_TYPES.includes(a.type) ? a.amount_cents : 0)))} left on hold after this`);
  const ok = ev.hits.filter((h) => h.satisfied).map((h) => `approved: ${h.why}`);
  return [`${what} allowed.`, cap([...parts, ...ok].join(", ")) + "."];
}

function cap(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

// ---------- backtest ----------

export interface PastDecision {
  id: number;
  decided_at: string;
  action: MoneyAction;
  decision: Decision;
}

export interface BacktestChange {
  id: number;
  decided_at: string;
  type: MoneyActionType;
  amount_cents: number;
  from: Outcome;
  to: Outcome;
}

const RANK: Record<Outcome, number> = { ALLOW: 0, REQUIRE_APPROVAL: 1, DENY: 2 };

/**
 * Replay past decisions with one more rule, using each decision's stored
 * facts (no network). Rules only tighten, so the new outcome is the stricter
 * of the old one and what the new rule alone would have said.
 */
export function backtest(past: PastDecision[], rule: Rule): { total: number; changed: BacktestChange[] } {
  const changed: BacktestChange[] = [];
  for (const p of past) {
    const from = p.decision.outcome;
    let alone: Outcome = "ALLOW";
    if (ruleMatches(rule, p.action, p.decision.facts)) {
      alone = rule.effect === "deny" ? "DENY" : approvedBy(rule.approver, p.decision.facts) ? "ALLOW" : "REQUIRE_APPROVAL";
    }
    const to = RANK[alone] > RANK[from] ? alone : from;
    if (to !== from) changed.push({ id: p.id, decided_at: p.decided_at, type: p.action.type, amount_cents: p.action.amount_cents, from, to });
  }
  return { total: past.length, changed };
}

// ---------- proof text (injection defence) ----------

export const TextScan = z.object({
  texts: z
    .array(
      z.object({
        text: z.string().max(200),
        box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }), // 0-1 of the image
        kind: z.enum(["product_label", "instruction", "handwritten_note", "other"]),
        addressed_to_reviewer: z.boolean(),
      }),
    )
    .max(20),
});
export type TextScan = z.infer<typeof TextScan>;

/** Belt and braces beside the model's own judgement (spec section 7). */
export const INJECTION_KEYWORDS = /verif|approv|inspect|ignore|system|mark .*(done|complete)|\bAI\b|assistant|\bpass\b/i;

/** Flagged if any text is an instruction, is aimed at a reviewer, or trips the keyword check. Brand marks don't flag. */
export function isFlagged(scan: TextScan): { flagged: boolean; excerpt?: string } {
  const hit = scan.texts.find(
    (t) => t.kind === "instruction" || t.addressed_to_reviewer || (t.kind !== "product_label" && INJECTION_KEYWORDS.test(t.text)),
  );
  return hit ? { flagged: true, excerpt: hit.text.slice(0, 120) } : { flagged: false };
}

/**
 * The masked re-judge table (spec section 7). `masked` is null when no text
 * was found, so no re-judge ran.
 */
export function afterMaskedRejudge(
  original: "VERIFIED" | "NEEDS_REVIEW" | "FAILED",
  masked: "VERIFIED" | "NEEDS_REVIEW" | "FAILED" | null,
  flagged: boolean,
): { verdict: "VERIFIED" | "NEEDS_REVIEW" | "FAILED"; reason?: string } {
  if (original !== "VERIFIED" || masked === null) return { verdict: original };
  if (masked !== "VERIFIED") return { verdict: "NEEDS_REVIEW", reason: "the verdict depended on text in the proof" };
  if (flagged) return { verdict: "NEEDS_REVIEW", reason: "text in the proof was addressed to the inspector; it was hidden and the work re-checked" };
  return { verdict: "VERIFIED" };
}
