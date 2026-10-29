// Tripwire in the browser demo. Every simulated release goes through the
// real evaluator from @trace/core with facts built from the demo's state, so
// the outcomes are exactly the ones the live guard would reach. Only PayPal's
// answers and the AI are simulated.

import {
  backtest,
  evaluate,
  plainReasons,
  PRESET_RULES,
  type Decision,
  type Facts,
  type MoneyAction,
  type PastDecision,
  type Rule,
} from "@trace/core/guard";

export const HOLD_CENTS = 42000;

export interface DemoLineFacts {
  id: string;
  cents: number;
  confidence: number;
  injected: boolean;
}

export interface DemoRelease {
  lines: DemoLineFacts[];
  capturedCents: number;
  captures: number;
  initiator: "homeowner" | "worker";
  final: boolean;
  approvedByHomeowner?: boolean;
  approvedUncaptured: number;
}

export function demoAction(r: DemoRelease, n: number): MoneyAction {
  return {
    request_id: `demo-capture-${n}`,
    type: r.final ? "FINAL_CAPTURE" : "CAPTURE",
    job_id: "00000000-0000-4000-8000-000000000420",
    line_ids: r.lines.map((l) => l.id),
    amount_cents: r.lines.reduce((s, l) => s + l.cents, 0),
    final: r.final,
    initiator: { kind: r.initiator },
    provenance: { verdict_ids: [], approval_event_ids: [], inputs: [] },
  };
}

export function demoFacts(r: DemoRelease): Facts {
  const amount = r.lines.reduce((s, l) => s + l.cents, 0);
  return {
    auth_status: r.capturedCents ? "PARTIALLY_CAPTURED" : "CREATED",
    auth_amount_cents: HOLD_CENTS,
    captured_cents: r.capturedCents,
    auth_remaining_cents: HOLD_CENTS - r.capturedCents,
    dispute_open: false,
    line_states: Object.fromEntries(r.lines.map((l) => [l.id, "APPROVED"])),
    lines_max_price_cents: Math.max(0, ...r.lines.map((l) => l.cents)),
    verdict_min_confidence: r.lines.length ? Math.min(...r.lines.map((l) => l.confidence)) : null,
    verdict_any_second_pass: false,
    injection_lines: r.lines.filter((l) => l.injected).map((l) => l.id),
    // In the demo a flagged line only reaches release after the homeowner approved it themselves.
    injection_unapproved_lines: [],
    approved_uncaptured_count: r.approvedUncaptured,
    released_24h_cents: r.capturedCents + amount,
    releases_10m_count: r.captures + 1,
    hours_since_authorization: 2,
    device_changed: false,
    request_reused: false,
    approved_by: { homeowner: !!r.approvedByHomeowner, tradesperson: false },
  };
}

export interface DemoDecision {
  outcome: "ALLOW" | "REQUIRE_APPROVAL" | "DENY";
  reasons: string[];
  /** The rules that asked, in their own words. */
  asked: string[];
}

export function decideDemo(r: DemoRelease, n: number, rules: Rule[]): DemoDecision {
  const a = demoAction(r, n);
  const f = demoFacts(r);
  const ev = evaluate(a, f, rules);
  return {
    outcome: ev.outcome,
    reasons: plainReasons(a, f, ev),
    asked: ev.hits.filter((h) => h.effect === "require_approval" && !h.satisfied).map((h) => h.why),
  };
}

export function rulesInForce(presetsOff: string[], own: Rule[]): Rule[] {
  return [...PRESET_RULES.filter((p) => !presetsOff.includes(p.id)), ...own];
}

/* ------------------------------------------------- the seeded history */

// Thirty past releases on earlier jobs, decided by the real evaluator with
// the presets on. The backtest replays them with a new rule added.
const AMOUNTS = [4500, 12000, 8000, 9000, 22000, 6500, 15000, 11000, 31000, 7000, 10000, 5500, 18000, 9500, 12500, 6000, 14000, 26000, 8500, 4000, 13000, 9000, 16500, 7500, 12000, 5000, 20000, 10500, 6000, 11500];
const CONFIDENCE = [0.95, 0.93, 0.86, 0.97, 0.94, 0.91, 0.96, 0.84, 0.95, 0.92, 0.98, 0.93, 0.9, 0.95, 0.94, 0.97, 0.88, 0.96, 0.93, 0.95, 0.92, 0.99, 0.94, 0.96, 0.93, 0.91, 0.95, 0.97, 0.94, 0.96];

export const HISTORY: PastDecision[] = AMOUNTS.map((cents, i) => {
  const worker = i % 3 === 1;
  const r: DemoRelease = {
    lines: [{ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, cents, confidence: CONFIDENCE[i]!, injected: false }],
    capturedCents: (i % 4) * 4000,
    // Earlier releases on the job were hours before, outside the 10-minute window.
    captures: 0,
    initiator: worker ? "worker" : "homeowner",
    final: i % 4 === 3,
    approvedUncaptured: 0,
  };
  const action = { ...demoAction(r, i), request_id: `history-${i}` };
  const facts = demoFacts(r);
  const ev = evaluate(action, facts, PRESET_RULES);
  const decided_at = new Date(Date.UTC(2026, 8, 2 + i, 10 + (i % 7), (i * 13) % 60)).toISOString();
  const decision: Decision = {
    request_id: action.request_id,
    outcome: ev.outcome,
    rule_hits: ev.hits,
    facts,
    injection: { flagged: false, proof_ids: [] },
    ...(ev.approver ? { approver: ev.approver } : {}),
    reasons_plain: plainReasons(action, facts, ev),
    decided_at,
  };
  return { id: i + 1, decided_at, action, decision };
});

/* ------------------------------------------------- canned compiler */

type Canned = { kind: "rule"; rule: Rule } | { kind: "unsupported"; reason: string };

const base = { owner: "homeowner" as const, scope: "account" as const, applies_to: ["CAPTURE", "FINAL_CAPTURE"] as Rule["applies_to"], effect: "require_approval" as const, approver: "homeowner" as const };

// What the compiler and the readback return for these words in the live app.
// The demo has no AI, so it knows only these.
export const CANNED: Record<string, Canned> = {
  "If the AI wasn't sure, ask me": {
    kind: "rule",
    rule: {
      ...base,
      id: "U1",
      when: [{ field: "verdict.min_confidence", op: "lt", value: 0.9 }],
      english: "If the AI wasn't sure, ask me",
      readback: "When the photo check behind a release was less than 90% sure, ask the homeowner first.",
    },
  },
  "Anything over $150 needs my OK": {
    kind: "rule",
    rule: {
      ...base,
      id: "U2",
      when: [{ field: "action.amount_cents", op: "gt", value: 15000 }],
      english: "Anything over $150 needs my OK",
      readback: "When a release is over $150.00, whoever starts it, ask the homeowner first.",
    },
  },
  "Don't release anything after 9pm": { kind: "unsupported", reason: "There's no time-of-day check" },
};

export function testRule(rule: Rule) {
  const out = backtest(HISTORY, rule);
  return { ...out, summary: `This rule would have changed ${out.changed.length} of your last ${out.total} decisions.` };
}
