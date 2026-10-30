// The evals' server runs (spec section 12): each step judges one photo case
// and scans a few planted-note images with the production models, and records
// the outcome. A run belongs to a set version and model, so it happens once; a
// changed set or model starts a new one. The site calls a step once a minute
// from its scheduled worker; the /accuracy page shows the results.

import { createHash } from "node:crypto";
import { isFlagged } from "@trace/core";
import * as store from "@trace/db";
import { judgePair, type Engine } from "@trace/engine";
import { ITEMS, render } from "./inject/set.ts";
import { summarizeInject, summarizeVerifier } from "./summary.ts";
import { CASES, caseImages, setVersion } from "./verifier/set.ts";

const MAX_ATTEMPTS = 3;
const INJECT_PER_STEP = 5;

export function injectVersion(): string {
  return `v1-${createHash("sha256").update(JSON.stringify(ITEMS)).digest("hex").slice(0, 12)}`;
}

const todo = (rows: store.EvalResultRow[], ids: string[]) => {
  const byId = new Map(rows.map((r) => [r.case_id, r]));
  return ids.filter((id) => {
    const r = byId.get(id);
    return !r || (r.error !== null && r.attempts < MAX_ATTEMPTS);
  });
};

const outcomes = (rows: store.EvalResultRow[]) => rows.map((r) => ({ caseId: r.case_id, expected: r.expected, got: r.got, error: r.error }));

async function verifierStep(e: Engine, loadPhoto: (name: string) => Promise<Uint8Array>): Promise<string> {
  const run = await store.evalRunFor(e.db, { kind: "verifier", setVersion: setVersion(), model: e.verifier.model, total: CASES.length });
  if (run.status === "done") return "verifier: done";
  const rows = await store.evalResults(e.db, run.id);
  const next = todo(rows, CASES.map((c) => c.id))[0];
  if (!next) {
    await store.finishEvalRun(e.db, run.id, { ...summarizeVerifier(outcomes(rows)) });
    return "verifier: finished";
  }
  const c = CASES.find((x) => x.id === next)!;
  try {
    const { before, after } = await caseImages(c, loadPhoto);
    const j = await judgePair(e.verifier, { id: c.id, title: c.title, acceptance: c.acceptance, before, after }, e.settings.confidenceThreshold);
    const correct = c.expect === "release" ? j.verdict === "VERIFIED" : j.verdict !== "VERIFIED";
    await store.saveEvalResult(e.db, {
      runId: run.id,
      caseId: c.id,
      expected: c.expect,
      got: j.verdict,
      correct,
      detail: { reasons: j.reasons, confidence: j.confidence, passes: j.passes, reason: j.observation.homeowner_reason },
    });
    return `verifier: ${c.id} ${j.verdict}`;
  } catch (err) {
    await store.saveEvalResult(e.db, { runId: run.id, caseId: c.id, expected: c.expect, got: null, correct: null, error: String(err).slice(0, 300) });
    return `verifier: ${c.id} error`;
  }
}

async function injectStep(e: Engine): Promise<string> {
  if (!e.scanner) return "inject: no scanner";
  const scanner = e.scanner;
  const run = await store.evalRunFor(e.db, { kind: "inject", setVersion: injectVersion(), model: scanner.model, total: ITEMS.length });
  if (run.status === "done") return "inject: done";
  const rows = await store.evalResults(e.db, run.id);
  const next = todo(rows, ITEMS.map((i) => i.id)).slice(0, INJECT_PER_STEP);
  if (!next.length) {
    await store.finishEvalRun(e.db, run.id, { ...summarizeInject(outcomes(rows)) });
    return "inject: finished";
  }
  await Promise.all(
    next.map(async (id) => {
      const item = ITEMS.find((i) => i.id === id)!;
      const expected = item.group === "planted" ? "flag" : "clear";
      try {
        const scan = await scanner.scanImage(await render(item));
        const f = isFlagged(scan);
        const got = f.flagged ? "flagged" : "clear";
        await store.saveEvalResult(e.db, { runId: run.id, caseId: id, expected, got, correct: got === (expected === "flag" ? "flagged" : "clear"), detail: { excerpt: f.excerpt ?? null, texts: scan.texts.length } });
      } catch (err) {
        await store.saveEvalResult(e.db, { runId: run.id, caseId: id, expected, got: null, correct: null, error: String(err).slice(0, 300) });
      }
    }),
  );
  return `inject: ${next.length} scanned`;
}

/** One step of each eval. Does nothing once both runs are done, or without a model key. */
export async function evalStep(e: Engine, loadPhoto: (name: string) => Promise<Uint8Array>): Promise<string[]> {
  if (!e.scanner) return ["no model key: evals skipped"];
  return Promise.all([verifierStep(e, loadPhoto), injectStep(e)]);
}

export interface EvalView {
  run: store.EvalRunRow;
  results: store.EvalResultRow[];
}

/** The newest run of each eval with its results, for the /accuracy page. */
export async function evalViews(e: Engine): Promise<{ verifier: EvalView | null; inject: EvalView | null }> {
  const runs = await store.latestEvalRuns(e.db);
  const view = async (kind: "verifier" | "inject") => {
    const run = runs.find((r) => r.kind === kind);
    return run ? { run, results: await store.evalResults(e.db, run.id) } : null;
  };
  const [verifier, inject] = await Promise.all([view("verifier"), view("inject")]);
  return { verifier, inject };
}
