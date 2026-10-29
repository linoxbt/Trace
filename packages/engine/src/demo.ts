// Judge mode: each visitor gets a private copy of the demo bathroom job, where
// they play both sides. Its before-photos are the demo's sample photos, and a
// "sample history" job holds 30 past payment checks so the guard's ledger and
// the rule backtest have something to show. Every money move on the demo job
// itself is real (PayPal sandbox) and goes through the guard as usual.

import { randomUUID } from "node:crypto";
import {
  evaluate,
  plainReasons,
  PRESET_RULES,
  type Acceptance,
  type Decision,
  type Facts,
  type MoneyAction,
  type MoneyActionType,
} from "@trace/core";
import * as store from "@trace/db";
import type { Engine } from "./deps.ts";
import { addBeforePhoto } from "./proof.ts";
import { createJob, saveScope, sendScope } from "./jobs.ts";
export { assertDemoBudget, DEMO_MODEL_CALLS_PER_HOUR } from "./demo-budget.ts";

export const DEMO_ADDRESS = "12 Admiralty Way, Lekki · demo";
export const DEMO_ANCHOR = { lat: 6.4474, lng: 3.4723, accuracyM: 8 };
export const HISTORY_ADDRESS = "Sample history · 30 past payment checks";

const SAME = "Same angle as the before-photo";
const acc = (criterion: string, show: string[], notShow: string[]): Acceptance => ({ criterion, must_show: show, must_not_show: notShow, framing: SAME });

/** The $420 bathroom from the demo script, four lines a camera can check. */
export const DEMO_LINES = [
  { code: "L1", title: "Fix dripping tap", priceCents: 12000, acceptance: acc("The tap is closed and the spout is dry", ["tap closed with a dry spout"], ["water drops at the spout"]), verifiableByPhoto: true },
  { code: "L2", title: "Reseal bath edge", priceCents: 9000, acceptance: acc("A continuous sealant bead runs along the bath edge", ["continuous white sealant bead"], ["gaps or mould in the bead"]), verifiableByPhoto: true },
  { code: "L3", title: "Refit towel rail", priceCents: 10000, acceptance: acc("The towel rail is level and fixed at both ends", ["rail level and fixed at both ends"], ["loose or missing bracket"]), verifiableByPhoto: true },
  { code: "L4", title: "Regrout shower wall", priceCents: 11000, acceptance: acc("Every joint on the wall is filled with grout", ["continuous grout in every joint"], ["visible cracks in the grout"]), verifiableByPhoto: true },
] as const;

export type DemoCode = (typeof DEMO_LINES)[number]["code"];

export interface DemoAssets {
  /** The before-photo for each demo line. */
  before: Record<DemoCode, Uint8Array>;
}

/**
 * A fresh demo job for this visitor, sent for approval: they approve the hold
 * as the homeowner, then prove the lines as the tradesperson.
 */
export async function createDemoJob(e: Engine, user: { id: string; email: string | null }, assets: DemoAssets): Promise<store.JobRow> {
  const email = user.email ?? `demo-${user.id.slice(0, 8)}@demo.trace.invalid`;
  const job = await createJob(e, { tradesId: user.id, homeownerId: user.id, homeownerEmail: email, address: DEMO_ADDRESS, demo: true, category: "home_repair" });
  const lines = await saveScope(e, job.id, user.id, DEMO_LINES.map((l) => ({ ...l, acceptance: { ...l.acceptance } })));
  for (const l of lines) {
    await addBeforePhoto(e, { jobId: job.id, tradesId: user.id, photo: assets.before[l.code as DemoCode], gps: DEMO_ANCHOR, deviceId: null, lineId: l.id });
  }
  await sendScope(e, job.id, user.id);
  await seedHistory(e, user.id, email);
  return store.mustGetJob(e.db, job.id);
}

// ---------- the sample history ----------

interface Scenario {
  type: MoneyActionType;
  amount: number;
  initiator?: MoneyAction["initiator"]["kind"];
  facts?: Partial<Facts>;
  /** Hours before now. */
  ago: number;
}

/** 30 past checks: mostly ordinary releases, plus the cases the guard exists for. */
function scenarios(): Scenario[] {
  const out: Scenario[] = [];
  const ordinary = [4500, 9000, 12000, 6000, 11000, 3500, 8000, 14000, 7500, 10000, 5500, 9500, 13000, 4000, 12500, 6500, 8500, 10500];
  ordinary.forEach((amount, i) => out.push({ type: "CAPTURE", amount, initiator: i % 3 === 0 ? "worker" : "homeowner", ago: 700 - i * 30 }));
  out.push({ type: "CAPTURE", amount: 22000, initiator: "worker", ago: 160 });
  out.push({ type: "CAPTURE", amount: 18000, initiator: "tradesperson", ago: 140 });
  out.push({ type: "CAPTURE", amount: 26000, initiator: "homeowner", ago: 120 });
  out.push({ type: "CAPTURE", amount: 9000, facts: { dispute_open: true }, ago: 100 });
  out.push({ type: "VOID", amount: 0, facts: { dispute_open: true }, ago: 96 });
  out.push({ type: "CAPTURE", amount: 11000, facts: { auth_status: "VOIDED" }, ago: 80 });
  out.push({ type: "CAPTURE", amount: 7000, facts: { auth_status: "EXPIRED" }, ago: 72 });
  out.push({ type: "REFUND", amount: 9000, initiator: "tradesperson", ago: 60 });
  out.push({ type: "REFUND", amount: 4500, initiator: "homeowner", ago: 48 });
  out.push({ type: "CAPTURE", amount: 10000, initiator: "agent", ago: 30 });
  out.push({ type: "CAPTURE", amount: 11000, initiator: "worker", facts: { injection_unapproved_lines: ["L4"], injection_lines: ["L4"] }, ago: 20 });
  out.push({ type: "FINAL_CAPTURE", amount: 11000, initiator: "homeowner", ago: 6 });
  return out;
}

function sampleFacts(s: Scenario, lineId: string): Facts {
  return {
    auth_status: "PARTIALLY_CAPTURED",
    auth_amount_cents: 42000,
    captured_cents: 0,
    auth_remaining_cents: 42000,
    dispute_open: false,
    line_states: { [lineId]: s.type === "REFUND" ? "CAPTURED" : "APPROVED" },
    lines_max_price_cents: Math.max(s.amount, 1),
    verdict_min_confidence: 0.91,
    verdict_any_second_pass: false,
    injection_lines: [],
    injection_unapproved_lines: [],
    approved_uncaptured_count: 0,
    released_24h_cents: s.amount,
    releases_10m_count: 1,
    hours_since_authorization: 30,
    device_changed: false,
    request_reused: false,
    approved_by: { homeowner: false, tradesperson: false },
    ...s.facts,
  };
}

/**
 * A completed "sample history" job for the visitor, holding 30 decisions the
 * real evaluator made from stored facts (built-ins and the default presets),
 * so they read exactly as live ones do. Created once per visitor.
 */
export async function seedHistory(e: Engine, userId: string, email: string): Promise<void> {
  const has = await e.db.query("select 1 from jobs where trades_id = $1 and demo and address = $2", [userId, HISTORY_ADDRESS]);
  if (has.rowCount) return;
  const job = await createJob(e, { tradesId: userId, homeownerId: userId, homeownerEmail: email, address: HISTORY_ADDRESS, demo: true, category: "home_repair" });
  const now = e.now().getTime();
  await e.db.tx(async (q) => {
    await store.updateJob(q, job.id, { status: "COMPLETED" });
    for (const s of scenarios()) {
      const lineId = randomUUID();
      const at = new Date(now - s.ago * 3_600_000).toISOString();
      const action: MoneyAction = {
        request_id: `sample-${randomUUID()}`,
        type: s.type,
        job_id: job.id,
        line_ids: s.type === "VOID" ? [] : [lineId],
        amount_cents: s.amount,
        ...(s.type === "REFUND" ? { capture_id: randomUUID() } : {}),
        initiator: { kind: s.initiator ?? "homeowner", user_id: userId },
        provenance: { verdict_ids: [], approval_event_ids: [], inputs: [{ ref: "sample-history", trust: "system" }] },
      };
      const facts = sampleFacts(s, lineId);
      const ev = evaluate(action, facts, PRESET_RULES);
      const decision: Decision = {
        request_id: action.request_id,
        outcome: ev.outcome,
        rule_hits: ev.hits,
        facts,
        injection: { flagged: facts.injection_lines.length > 0, proof_ids: [] },
        ...(ev.approver ? { approver: ev.approver } : {}),
        reasons_plain: plainReasons(action, facts, ev),
        decided_at: at,
      };
      await store.insertDecision(q, action, decision, new Date(at));
    }
    await store.appendEvent(q, { jobId: job.id, actor: "system", type: "SAMPLE_HISTORY", data: { decisions: 30 } });
  });
}
