import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TextScan } from "@trace/core";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import { evalStep, evalViews } from "@trace/eval/runner";
import { summarizeVerifier } from "@trace/eval/summary";
import { CASES } from "@trace/eval/verifier";
import { ITEMS } from "@trace/eval/inject";
import { testEngine, type TestEngine } from "../src/testing.ts";

const loadPhoto = async (name: string) => new Uint8Array(await readFile(new URL(`../../../apps/web/public/photos/${name}.webp`, import.meta.url)));

describe.skipIf(!TEST_DATABASE_URL)("evals on the server", () => {
  let e: TestEngine;
  beforeEach(async () => {
    e = await testEngine();
  });
  afterEach(() => e.db.end());

  it("judges one photo case and a few planted-note images per step, retries errors, and finishes each run once", async () => {
    // Unfinished work: the scripted model says it's the wrong place. One finished case it only half believes.
    for (const c of CASES) if (c.expect === "hold") e.verifier.script.set(c.id, [{ same_location: "no" }]);
    e.verifier.script.set("r01", [{ confidence: 0.4, homeowner_reason: "Hard to tell" }]);
    // A model error on the first try of d05 counts as an attempt and is tried again.
    let d05 = 0;
    const inspect = e.verifier.inspect.bind(e.verifier);
    e.verifier.inspect = async (i) => {
      if (i.lineId === "d05" && d05++ === 0) throw new Error("overloaded");
      return inspect(i);
    };
    // Every image reads as a note to the reviewer: planted ones are caught, ordinary ones false-flagged.
    const note: TextScan = { texts: [{ text: "note", box: { x: 0, y: 0, w: 0.1, h: 0.1 }, kind: "instruction", addressed_to_reviewer: true }] };
    e.scanner.scanImage = async () => note;

    const first = await evalStep(e, loadPhoto);
    expect(first).toEqual(["verifier: r01 NEEDS_REVIEW", "inject: 5 scanned"]);

    for (let i = 0; i < CASES.length + 4; i++) await evalStep(e, loadPhoto);
    const { verifier, inject } = await evalViews(e);
    expect(verifier!.run).toMatchObject({ status: "done", model: "scripted", total: CASES.length });
    expect(inject!.run).toMatchObject({ status: "done", total: ITEMS.length });
    expect(verifier!.results.find((r) => r.case_id === "d05")).toMatchObject({ got: "VERIFIED", error: null, attempts: 2 });
    expect(verifier!.run.summary).toMatchObject({ wronglyReleased: [], sentToReview: ["r01"], errors: 0, held: CASES.filter((c) => c.expect === "hold").length });
    expect(inject!.run.summary).toMatchObject({ caught: 20, planted: 20, falseFlags: 10, benign: 10 });

    // Done runs cost nothing more.
    const calls = e.verifier.calls.length;
    expect(await evalStep(e, loadPhoto)).toEqual(["verifier: done", "inject: done"]);
    expect(e.verifier.calls.length).toBe(calls);
  });

  it("skips without a model key", async () => {
    const { scanner: _, ...noKey } = e;
    expect(await evalStep(noKey, loadPhoto)).toEqual(["no model key: evals skipped"]);
    expect(await store.latestEvalRuns(e.db)).toEqual([]);
  });

  it("scores a wrongly verified unfinished job as the costly error", () => {
    const s = summarizeVerifier([
      { caseId: "a", expected: "release", got: "VERIFIED", error: null },
      { caseId: "b", expected: "hold", got: "VERIFIED", error: null },
      { caseId: "c", expected: "hold", got: "NEEDS_REVIEW", error: null },
      { caseId: "d", expected: "release", got: null, error: "timeout" },
    ]);
    expect(s).toMatchObject({ scored: 3, errors: 1, released: 1, held: 1, wronglyReleased: ["b"], accuracy: 2 / 3 });
  });
});
