import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import {
  answerApproval,
  autoRelease,
  decideLine,
  expireApprovals,
  guardedCapture,
  guardedVoid,
  release,
  requestRelease,
  reserveExactCapture,
  sendCapture,
} from "../src/index.ts";
import { testEngine, type TestEngine } from "../src/testing.ts";
import { heldJob, lineStatus, prove, type Held } from "./helpers.ts";

const ROOT = join(import.meta.dirname, "../../..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "node_modules" || name === ".next" || name === "dist" || name === "test") return [];
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|tsx|mts)$/.test(name) && !name.endsWith(".d.ts") ? [p] : [];
  });
}

describe("guard boundary: one way to move money", () => {
  const files = [...sources(join(ROOT, "packages/engine/src")), ...sources(join(ROOT, "apps"))];

  it("only guard/execute.ts imports the money client", () => {
    const importers = files.filter((f) => /from\s+["'][^"']*paypal-money(\.ts)?["']/.test(readFileSync(f, "utf8")));
    expect(importers.map((f) => relative(ROOT, f))).toEqual(["packages/engine/src/guard/execute.ts"]);
  });

  it("no other app or engine file calls a money-moving PayPal method", () => {
    const money = /\.(captureAuthorization|voidAuthorization|reauthorize|refundCapture|provideEvidence)\s*\(/;
    const callers = files.filter((f) => money.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f));
    expect(callers).toEqual(["packages/engine/src/guard/paypal-money.ts"]);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("guard: every money move is decided first", () => {
  let e: TestEngine;
  beforeEach(async () => {
    e = await testEngine();
  });
  afterEach(() => e.db.end());

  async function approved(h: Held, codes: string[]) {
    for (const c of codes) {
      await prove(e, h, c);
      await decideLine(e, h.lines[c]!.id, h.home, { approve: true });
    }
  }

  /** L1 + L2 verified, then auto-approved by the worker: $210 over the $150 preset. */
  async function autoReleaseOver150(h: Held) {
    for (const c of ["L1", "L2"]) await prove(e, h, c);
    const { dueAt } = await requestRelease(e, h.jobId, h.trades);
    e.clock.t = new Date(dueAt.getTime() + 1000);
    const out = await autoRelease(e);
    const r = out.released[0]!;
    if (r.kind !== "needs_approval") throw new Error(`expected an approval request, got ${r.kind}`);
    return r;
  }

  it("writes the decision to the ledger before PayPal is asked to capture", async () => {
    const h = await heldJob(e);
    await approved(h, ["L1"]);
    const seen: store.DecisionRow[][] = [];
    const capture = e.paypal.captureAuthorization.bind(e.paypal);
    e.paypal.captureAuthorization = async (id, input, requestId) => {
      seen.push(await store.decisionsForRequest(e.db, requestId));
      return capture(id, input, requestId);
    };
    expect(await release(e, h.jobId, "homeowner", h.home)).toMatchObject({ kind: "captured", amountCents: 12000 });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.map((d) => d.outcome)).toEqual(["ALLOW"]);
    expect(seen[0]![0]!.executed).toBe(false);
    const [row] = await store.decisionsForJob(e.db, h.jobId);
    expect(row).toMatchObject({ outcome: "ALLOW", executed: true });
    expect(row!.action).toMatchObject({ type: "CAPTURE", amount_cents: 12000, initiator: { kind: "homeowner", user_id: h.home } });
  });

  it("blocks a release while a dispute is open at PayPal, even before its webhook arrives (B3)", async () => {
    const h = await heldJob(e);
    await approved(h, ["L1"]);
    const first = await release(e, h.jobId);
    if (first.kind !== "captured") throw new Error(first.kind);
    const cap = await store.getCapture(e.db, first.captureId);
    e.paypal.openDispute(cap!.paypal_capture_id!);
    await approved(h, ["L2"]);
    const r = await release(e, h.jobId);
    expect(r).toMatchObject({ kind: "blocked", reasons: ["Release of $90.00 blocked.", "A dispute is open on this job."] });
    expect(e.paypal.capturedOn(h.authId)).toBe(12000);
    expect(await lineStatus(e, h)).toMatchObject({ L2: "APPROVED" });
  });

  it("denies when PayPal can't be read, moves nothing, and allows on the next try", async () => {
    const h = await heldJob(e);
    await approved(h, ["L1"]);
    e.paypal.failNext("getAuthorization");
    const r = await release(e, h.jobId);
    expect(r).toMatchObject({ kind: "blocked", reasons: ["PayPal didn't respond, so nothing was moved. Try again."] });
    expect(e.paypal.calls.filter((c) => c.op === "captureAuthorization")).toHaveLength(0);
    const [row] = await store.decisionsForJob(e.db, h.jobId);
    expect(row!.decision.rule_hits).toEqual([expect.objectContaining({ rule_id: "PREFLIGHT", effect: "deny" })]);
    expect(await release(e, h.jobId)).toMatchObject({ kind: "captured", amountCents: 12000 });
  });

  it("never lets an agent move money (B6)", async () => {
    const h = await heldJob(e);
    await approved(h, ["L1"]);
    const r = await guardedCapture(e, h.jobId, { kind: "agent" });
    expect(r).toMatchObject({ kind: "blocked" });
    expect(e.paypal.calls.filter((c) => c.op === "captureAuthorization")).toHaveLength(0);
  });

  it("refuses a request id reused for a different action (B11)", async () => {
    const h = await heldJob(e);
    await approved(h, ["L1"]);
    expect(await guardedCapture(e, h.jobId, { kind: "homeowner" }, { requestId: "capture-fixed" })).toMatchObject({ kind: "captured" });
    await approved(h, ["L2"]);
    const r = await guardedCapture(e, h.jobId, { kind: "homeowner" }, { requestId: "capture-fixed" });
    expect(r).toMatchObject({ kind: "blocked" });
    expect(e.paypal.capturedOn(h.authId)).toBe(12000);
  });

  it("won't send a capture that no decision allowed", async () => {
    const h = await heldJob(e);
    await approved(h, ["L1"]);
    const rogue = await e.db.tx((q) =>
      reserveExactCapture(q, h.jobId, { requestId: "capture-rogue", lineIds: [h.lines.L1!.id], amountCents: 12000, final: false, actor: "system" }),
    );
    expect(await sendCapture(e, rogue.id)).toMatchObject({ kind: "failed", reason: "no guard decision allows this capture" });
    expect(e.paypal.calls.filter((c) => c.op === "captureAuthorization")).toHaveLength(0);
    expect(await store.getLine(e.db, h.lines.L1!.id)).toMatchObject({ status: "APPROVED", capture_id: null });
  });

  it("asks the homeowner before the worker releases over $150 (P1), then captures on their tap", async () => {
    const h = await heldJob(e);
    const ask = await autoReleaseOver150(h);
    expect(ask.reasons[0]).toBe("Release of $210.00 is waiting for the homeowner.");
    expect(e.paypal.calls.filter((c) => c.op === "captureAuthorization")).toHaveLength(0);
    expect(await lineStatus(e, h)).toMatchObject({ L1: "APPROVED", L2: "APPROVED" });

    await expect(answerApproval(e, ask.approvalId, h.trades, true)).rejects.toMatchObject({ code: "forbidden" });
    const out = await answerApproval(e, ask.approvalId, h.home, true);
    expect(out).toMatchObject({ kind: "ran", outcome: "ALLOW", release: { kind: "captured", amountCents: 21000 } });

    const rows = await store.decisionsForJob(e.db, h.jobId);
    expect(rows.map((r) => r.outcome)).toEqual(["REQUIRE_APPROVAL", "ALLOW"]);
    expect(new Set(rows.map((r) => r.request_id)).size).toBe(1);
    const cap = (await e.db.query<{ request_id: string }>("select request_id from captures")).rows;
    expect(cap).toEqual([{ request_id: rows[0]!.request_id }]);
    await expect(answerApproval(e, ask.approvalId, h.home, true)).rejects.toMatchObject({ code: "approval_closed" });
  });

  it("an approval is not a bypass: built-in deny rules still run on the re-run", async () => {
    const h = await heldJob(e);
    const ask = await autoReleaseOver150(h);
    e.paypal.expire(h.authId);
    const out = await answerApproval(e, ask.approvalId, h.home, true);
    expect(out).toMatchObject({ kind: "ran", outcome: "DENY" });
    expect(out.kind === "ran" && out.reasons.join(" ")).toContain("The hold is voided at PayPal.");
    expect(e.paypal.calls.filter((c) => c.op === "captureAuthorization")).toHaveLength(0);
  });

  it("a denied request moves nothing and the lines stay approved", async () => {
    const h = await heldJob(e);
    const ask = await autoReleaseOver150(h);
    expect(await answerApproval(e, ask.approvalId, h.home, false)).toEqual({ kind: "denied" });
    expect(e.paypal.calls.filter((c) => c.op === "captureAuthorization")).toHaveLength(0);
    expect(await lineStatus(e, h)).toMatchObject({ L1: "APPROVED", L2: "APPROVED" });
  });

  it("expires an unanswered request after 24 hours, and a late tap can't revive it", async () => {
    const h = await heldJob(e);
    const ask = await autoReleaseOver150(h);
    e.clock.t = new Date(e.clock.t.getTime() + 23 * 3600_000);
    expect(await expireApprovals(e)).toBe(0);
    e.clock.t = new Date(e.clock.t.getTime() + 2 * 3600_000);
    await expect(answerApproval(e, ask.approvalId, h.home, true)).rejects.toMatchObject({ code: "approval_expired" });
    // The late tap itself recorded the expiry, so the worker has nothing left to do.
    expect((await store.getApproval(e.db, ask.approvalId))?.status).toBe("EXPIRED");
    expect(await expireApprovals(e)).toBe(0);
    expect(e.paypal.calls.filter((c) => c.op === "captureAuthorization")).toHaveLength(0);
  });

  it("the worker expires requests nobody answered", async () => {
    const h = await heldJob(e);
    const ask = await autoReleaseOver150(h);
    e.clock.t = new Date(e.clock.t.getTime() + 25 * 3600_000);
    expect(await expireApprovals(e)).toBe(1);
    await expect(answerApproval(e, ask.approvalId, h.home, true)).rejects.toMatchObject({ code: "approval_closed" });
    expect((await store.getEvents(e.db, h.jobId)).some((x) => x.type === "GUARD_APPROVAL_EXPIRED")).toBe(true);
  });

  it("voiding with approved work unpaid needs both sides (B9): one tap each", async () => {
    const h = await heldJob(e);
    await approved(h, ["L1"]);
    const auth = (await store.getBaseAuthorization(e.db, h.jobId))!;
    const v = await guardedVoid(e, h.jobId, { kind: "homeowner", userId: h.home }, { auth });
    expect(v).toMatchObject({ outcome: "REQUIRE_APPROVAL", voided: false });
    if (v.outcome !== "REQUIRE_APPROVAL") throw new Error(v.outcome);

    expect(await answerApproval(e, v.approvalId, h.home, true)).toEqual({ kind: "waiting", for: "tradesperson" });
    await expect(answerApproval(e, v.approvalId, h.home, true)).rejects.toMatchObject({ code: "already_approved" });
    expect(e.paypal.calls.filter((c) => c.op === "voidAuthorization")).toHaveLength(0);

    expect(await answerApproval(e, v.approvalId, h.trades, true)).toMatchObject({ kind: "ran", outcome: "ALLOW" });
    expect(e.paypal.calls.filter((c) => c.op === "voidAuthorization")).toHaveLength(1);
  });

  it("in judge mode one person plays both sides, so one tap counts for both", async () => {
    const h = await heldJob(e, { demo: true });
    await approved(h, ["L1"]);
    const auth = (await store.getBaseAuthorization(e.db, h.jobId))!;
    const v = await guardedVoid(e, h.jobId, { kind: "homeowner", userId: h.home }, { auth });
    if (v.outcome !== "REQUIRE_APPROVAL") throw new Error(v.outcome);
    expect(await answerApproval(e, v.approvalId, h.home, true)).toMatchObject({ kind: "ran", outcome: "ALLOW" });
  });
});
