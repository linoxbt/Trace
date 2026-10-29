import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import {
  autoRelease,
  compileRule,
  decideLine,
  listRules,
  release,
  removeRule,
  requestRelease,
  saveRule,
  setPresetOn,
  setRuleOn,
  type CompiledRule,
} from "../src/index.ts";
import { makeUser, testEngine, type TestEngine } from "../src/testing.ts";
import { heldJob, prove, type Held } from "./helpers.ts";

const OVER_150 = "Anything over $150 needs my OK";
const over150: CompiledRule = {
  applies_to: ["CAPTURE", "FINAL_CAPTURE"],
  when: [{ field: "action.amount_cents", op: "gt", value: 15000 }],
  effect: "require_approval",
};

describe.skipIf(!TEST_DATABASE_URL)("rules people write", () => {
  let e: TestEngine;
  beforeEach(async () => {
    e = await testEngine();
    e.compiler.answers.set(OVER_150, { kind: "rule", rule: over150 });
    e.compiler.answers.set("Don't release anything after 9pm", { kind: "unsupported", reason: "there's no time-of-day check" });
  });
  afterEach(() => e.db.end());

  async function approved(h: Held, codes: string[]) {
    for (const c of codes) {
      await prove(e, h, c);
      await decideLine(e, h.lines[c]!.id, h.home, { approve: true });
    }
  }

  async function saveOver150(userId: string) {
    const c = await compileRule(e, userId, { english: OVER_150, side: "homeowner", scope: "account" });
    if (c.kind !== "rule") throw new Error(c.reason);
    return saveRule(e, userId, { english: OVER_150, side: "homeowner", scope: "account", rule: c.rule, readback: c.readback });
  }

  it("compiles, reads back from the JSON alone, and then holds a release the homeowner started", async () => {
    const h = await heldJob(e);
    const c = await compileRule(e, h.home, { english: OVER_150, side: "homeowner", scope: "account" });
    expect(c).toMatchObject({ kind: "rule", rule: over150, readback: 'When action.amount_cents gt 15000, ask the owner.' });
    // The readback model got the rule JSON, never the person's words.
    expect(e.compiler.readbackSaw).toEqual([over150]);
    expect(c.kind === "rule" && c.backtest.summary).toBe("There are no past decisions to test this rule against yet.");

    await saveOver150(h.home);
    await approved(h, ["L1", "L2"]);
    // P1 lets a homeowner's own release through; their own stricter rule doesn't.
    const r = await release(e, h.jobId, "homeowner", h.home);
    expect(r).toMatchObject({ kind: "needs_approval" });
    const [d] = await store.decisionsForJob(e.db, h.jobId);
    expect(d!.decision.rule_hits).toEqual([expect.objectContaining({ effect: "require_approval", approver: "homeowner", why: OVER_150 })]);
  });

  it("says when a rule can't be checked, instead of guessing", async () => {
    const h = await heldJob(e);
    expect(await compileRule(e, h.home, { english: "Don't release anything after 9pm", side: "homeowner", scope: "account" })).toEqual({
      kind: "unsupported",
      reason: "there's no time-of-day check",
    });
    expect(e.compiler.readbackSaw).toEqual([]);
  });

  it("turns a compiled rule that could never fire into 'unsupported'", async () => {
    const h = await heldJob(e);
    e.compiler.answers.set("weird", { kind: "rule", rule: { ...over150, when: [{ field: "action.amount_cents", op: "eq", value: "lots" }] } });
    const c = await compileRule(e, h.home, { english: "weird", side: "homeowner", scope: "account" });
    expect(c).toMatchObject({ kind: "unsupported", reason: "Trace can't check that as written: action.amount_cents needs a number" });
  });

  it("can only tighten: a rule that allows is refused", async () => {
    const h = await heldJob(e);
    const loosen = { ...over150, effect: "allow" } as unknown as CompiledRule;
    await expect(saveRule(e, h.home, { english: "let everything through", side: "homeowner", scope: "account", rule: loosen, readback: "x" })).rejects.toThrow();
  });

  it("tests a new rule against the user's past decisions", async () => {
    const h = await heldJob(e);
    await approved(h, ["L1"]);
    await release(e, h.jobId, "homeowner", h.home); // $120: allowed
    await approved(h, ["L2", "L3"]);
    await release(e, h.jobId, "homeowner", h.home); // $190: allowed
    const c = await compileRule(e, h.home, { english: OVER_150, side: "homeowner", scope: "account" });
    if (c.kind !== "rule") throw new Error(c.reason);
    expect(c.backtest.summary).toBe("This rule would have changed 1 of your last 2 decisions.");
    expect(c.backtest.changed).toEqual([expect.objectContaining({ type: "CAPTURE", amount_cents: 19000, from: "ALLOW", to: "REQUIRE_APPROVAL" })]);
    // The tradesperson side of the same jobs isn't the homeowner's history.
    const asTrades = await compileRule(e, h.trades, { english: OVER_150, side: "tradesperson", scope: "account" });
    expect(asTrades.kind === "rule" && asTrades.backtest.total).toBe(2);
    const stranger = await makeUser(e.db, "stranger");
    const none = await compileRule(e, stranger, { english: OVER_150, side: "homeowner", scope: "account" });
    expect(none.kind === "rule" && none.backtest.total).toBe(0);
  });

  it("a homeowner rule only applies where its owner is the homeowner", async () => {
    const h = await heldJob(e);
    // The tradesperson here is a homeowner elsewhere, and has a strict homeowner rule.
    await saveOver150(h.trades);
    await approved(h, ["L1", "L2"]);
    expect(await release(e, h.jobId, "homeowner", h.home)).toMatchObject({ kind: "captured", amountCents: 21000 });
  });

  it("a rule switched off or removed stops asking", async () => {
    const h = await heldJob(e);
    const row = await saveOver150(h.home);
    await setRuleOn(e, h.home, row.id, false);
    await approved(h, ["L1", "L2"]);
    expect(await release(e, h.jobId, "homeowner", h.home)).toMatchObject({ kind: "captured" });
    expect((await listRules(e, h.home)).rules).toEqual([expect.objectContaining({ id: row.id, enabled: false, english: OVER_150 })]);
    await removeRule(e, h.home, row.id);
    expect((await listRules(e, h.home)).rules).toEqual([]);
    await expect(removeRule(e, h.trades, row.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("job rules need the right side of that job", async () => {
    const h = await heldJob(e);
    await expect(compileRule(e, h.trades, { english: OVER_150, side: "homeowner", scope: "job", jobId: h.jobId })).rejects.toMatchObject({ code: "forbidden" });
    const c = await compileRule(e, h.home, { english: OVER_150, side: "homeowner", scope: "job", jobId: h.jobId });
    if (c.kind !== "rule") throw new Error(c.reason);
    await saveRule(e, h.home, { english: OVER_150, side: "homeowner", scope: "job", jobId: h.jobId, rule: c.rule, readback: c.readback });
    expect((await store.getEvents(e.db, h.jobId)).some((x) => x.type === "RULE_ADDED")).toBe(true);
  });

  it("the homeowner can turn a preset off, and the worker's $210 release then goes through", async () => {
    const h = await heldJob(e);
    await setPresetOn(e, h.home, "P1", false);
    expect((await listRules(e, h.home)).presets.find((p) => p.id === "P1")?.enabled).toBe(false);
    for (const c of ["L1", "L2"]) await prove(e, h, c);
    const { dueAt } = await requestRelease(e, h.jobId, h.trades);
    e.clock.t = new Date(dueAt.getTime() + 1000);
    expect((await autoRelease(e)).released[0]).toMatchObject({ kind: "captured", amountCents: 21000 });
  });
});
