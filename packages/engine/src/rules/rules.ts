// People's own payment rules (Tripwire section 5): compile from plain
// English, read back, test against history, save, switch on and off. Rules
// only ever tighten; the built-in rules can't be touched from here.

import { backtest, PRESET_RULES, Rule, ruleProblems, type BacktestChange } from "@trace/core";
import * as store from "@trace/db";
import { spendBudget } from "../budget.ts";
import type { Engine } from "../deps.ts";
import { badRequest, EngineError, forbidden } from "../errors.ts";
import type { CompiledRule } from "./compile.ts";

export type RuleSide = "homeowner" | "tradesperson";

export interface RuleTarget {
  side: RuleSide;
  scope: "job" | "account";
  jobId?: string | null;
}

export interface BacktestResult {
  total: number;
  changed: BacktestChange[];
  summary: string;
}

export type CompileOutcome =
  | { kind: "rule"; rule: CompiledRule; readback: string; backtest: BacktestResult; draftId: string }
  | { kind: "unsupported"; reason: string };

const MAX_ENGLISH = 300;

async function checkTarget(e: Engine, userId: string, t: RuleTarget): Promise<string | null> {
  if (t.scope === "account") return null;
  if (!t.jobId) throw badRequest("bad_rule", "a job rule needs its job");
  const job = await store.mustGetJob(e.db, t.jobId);
  const mine = t.side === "homeowner" ? job.homeowner_id === userId : job.trades_id === userId;
  if (!mine) throw forbidden(`you aren't the ${t.side} on this job`);
  return job.id;
}

/** A compiled rule with its owner, scope and words filled in, checked for anything that can't fire. */
function fullRule(id: string, english: string, readback: string, t: RuleTarget, r: CompiledRule): Rule {
  const rule = Rule.parse({
    id,
    owner: t.side,
    scope: t.scope,
    applies_to: r.applies_to,
    when: r.when,
    effect: r.effect,
    // Whoever owns the rule says yes unless it names someone else.
    ...(r.effect === "require_approval" ? { approver: r.approver ?? t.side } : {}),
    english,
    readback,
  });
  const problems = ruleProblems(rule);
  if (problems.length) throw new EngineError("unsupported_rule", `Trace can't check that as written: ${problems[0]}`, 422);
  return rule;
}

function cleanEnglish(english: string): string {
  const s = english.trim().replace(/\s+/g, " ");
  if (s.length < 3 || s.length > MAX_ENGLISH) throw badRequest("bad_rule", `write the rule in 3 to ${MAX_ENGLISH} characters`);
  return s;
}

/** Plain English to a rule, its blind readback, and what it would have changed. Nothing is saved. */
export async function compileRule(e: Engine, userId: string, input: RuleTarget & { english: string }): Promise<CompileOutcome> {
  if (!e.compiler) throw new EngineError("compiler_unavailable", "the rule writer isn't set up yet", 503);
  const english = cleanEnglish(input.english);
  await checkTarget(e, userId, input);
  await spendBudget(e, userId, "rule_compile");
  let compiled;
  try {
    compiled = await e.compiler.compile(english, input.side);
  } catch (err) {
    e.log.error("rule compiler failed", { err: String(err) });
    throw new EngineError("compiler_unavailable", "the rule writer didn't answer; try again", 503);
  }
  if (compiled.kind === "unsupported") return compiled;
  let rule: Rule;
  try {
    rule = fullRule("draft", english, "", input, compiled.rule);
  } catch (err) {
    if (err instanceof EngineError && err.code === "unsupported_rule") return { kind: "unsupported", reason: err.message };
    throw err;
  }
  let readback: string;
  try {
    readback = await e.compiler.readback(compiled.rule, input.side);
  } catch (err) {
    e.log.error("rule readback failed", { err: String(err) });
    throw new EngineError("compiler_unavailable", "the rule writer didn't answer; try again", 503);
  }
  const backtest = await backtestRule(e, userId, input, rule);
  // Kept so the rule saved is this one, with this readback; drafts older than a day are cleared as new ones come in.
  const target: RuleTarget = { side: input.side, scope: input.scope, jobId: input.scope === "job" ? input.jobId ?? null : null };
  await e.db.query("delete from rule_drafts where owner_id = $1 and created_at < now() - interval '1 day'", [userId]);
  const { rows } = await e.db.query<{ id: string }>(
    "insert into rule_drafts (owner_id, target, english, readback, rule) values ($1, $2, $3, $4, $5) returning id",
    [userId, JSON.stringify(target), english, readback.slice(0, 400), JSON.stringify(compiled.rule)],
  );
  return { kind: "rule", rule: compiled.rule, readback, backtest, draftId: rows[0]!.id };
}

/** Replay the user's past decisions with one more rule, from the stored facts. */
export async function backtestRule(e: Engine, userId: string, t: RuleTarget, rule: Rule): Promise<BacktestResult> {
  const past = await store.decisionsForUser(e.db, userId, { side: t.side, jobId: t.scope === "job" ? t.jobId : null });
  const out = backtest(
    past.map((d) => ({ id: d.id, decided_at: d.decided_at.toISOString(), action: d.action, decision: d.decision })),
    rule,
  );
  const n = out.changed.length;
  const summary =
    out.total === 0
      ? "There are no past decisions to test this rule against yet."
      : `This rule would have changed ${n} of your last ${out.total} decision${out.total === 1 ? "" : "s"}.`;
  return { ...out, summary };
}

/** Save a rule the person has read back and accepted: the draft Trace compiled for them, as it was. */
export async function saveRule(e: Engine, userId: string, input: { draftId: string }): Promise<store.RuleRow> {
  const { rows } = await e.db.query<{ target: RuleTarget; english: string; readback: string; rule: CompiledRule }>(
    "delete from rule_drafts where id = $1 and owner_id = $2 and created_at > now() - interval '1 day' returning target, english, readback, rule",
    [input.draftId, userId],
  );
  const draft = rows[0];
  if (!draft) throw new EngineError("not_found", "that rule draft has expired; write the rule again", 404);
  const { target: t, english, readback } = draft;
  // Checked again: the person may have left the job since compiling.
  const jobId = await checkTarget(e, userId, t);
  const rule = fullRule("new", english, readback, t, draft.rule);
  return e.db.tx(async (q) => {
    const row = await store.insertRule(q, { ownerId: userId, ownerKind: t.side, scope: t.scope, jobId, rule });
    if (jobId) await store.appendEvent(q, { jobId, actor: t.side, type: "RULE_ADDED", data: { rule: row.id, english, readback } });
    return row;
  });
}

export interface RulesView {
  presets: { id: string; english: string; readback: string; enabled: boolean }[];
  rules: { id: string; side: RuleSide; scope: "job" | "account"; jobId: string | null; english: string; readback: string; enabled: boolean; effect: string; createdAt: string }[];
}

export async function listRules(e: Engine, userId: string): Promise<RulesView> {
  const rows = await store.rulesOfOwner(e.db, userId);
  const off = new Set(rows.filter((r) => r.preset && !r.enabled).map((r) => r.preset));
  return {
    presets: PRESET_RULES.map((p) => ({ id: p.id, english: p.english, readback: p.readback, enabled: !off.has(p.id) })),
    rules: rows
      .filter((r) => r.rule)
      .map((r) => ({
        id: r.id,
        side: r.owner_kind,
        scope: r.scope,
        jobId: r.job_id,
        english: r.english,
        readback: r.readback,
        enabled: r.enabled,
        effect: r.rule!.effect,
        createdAt: r.created_at.toISOString(),
      })),
  };
}

export async function setRuleOn(e: Engine, userId: string, ruleId: string, enabled: boolean): Promise<void> {
  const row = await store.setRuleEnabled(e.db, userId, ruleId, enabled);
  if (!row || row.preset) throw new EngineError("not_found", "rule not found", 404);
}

export async function removeRule(e: Engine, userId: string, ruleId: string): Promise<void> {
  if (!(await store.deleteRule(e.db, userId, ruleId))) throw new EngineError("not_found", "rule not found", 404);
}

/** Presets are the homeowner's: on by default, and each can be turned off or back on. */
export async function setPresetOn(e: Engine, userId: string, presetId: string, enabled: boolean): Promise<void> {
  const preset = PRESET_RULES.find((p) => p.id === presetId);
  if (!preset) throw new EngineError("not_found", "preset not found", 404);
  await store.setPreset(e.db, userId, preset.id, preset.english, enabled);
}
