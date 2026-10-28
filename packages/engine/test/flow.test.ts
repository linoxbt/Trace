import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import {
  autoRelease,
  confirmClose,
  decideLine,
  EngineError,
  reauthorizeDue,
  release,
  requestRelease,
  retrySendingCaptures,
  submitProof,
  TokenRejected,
} from "../src/index.ts";
import { testEngine, testPhoto, type TestEngine } from "../src/testing.ts";
import { ANCHOR, DEVICE, failing, heldJob, lineStatus, prove } from "./helpers.ts";

describe.skipIf(!TEST_DATABASE_URL)("engine: the money flow", () => {
  let e: TestEngine;
  beforeEach(async () => {
    e = await testEngine();
  });
  afterEach(() => e.db.end());

  async function approveAll(h: Awaited<ReturnType<typeof heldJob>>, codes: string[]) {
    for (const c of codes) await decideLine(e, h.lines[c]!.id, h.home, { approve: true });
  }

  it("releases $310 for three verified lines while $110 stays held, then $110 after the grout is redone", async () => {
    const h = await heldJob(e);
    expect((await store.mustGetJob(e.db, h.jobId)).status).toBe("AUTHORIZED");

    e.verifier.script.set(h.lines.L4!.id, failing("visible cracks in the grout", "crack in the joint above the soap dish"));
    for (const c of ["L1", "L2", "L3"]) expect((await prove(e, h, c)).verdict).toBe("VERIFIED");
    const grout = await prove(e, h, "L4");
    expect(grout.verdict).toBe("FAILED");
    expect(grout.reasons.join()).toContain("soap dish");

    await requestRelease(e, h.jobId, h.trades);
    await approveAll(h, ["L1", "L2", "L3"]);
    const r1 = await release(e, h.jobId);
    expect(r1).toMatchObject({ kind: "captured", amountCents: 31000, status: "COMPLETED" });
    expect(await lineStatus(e, h)).toEqual({ L1: "CAPTURED", L2: "CAPTURED", L3: "CAPTURED", L4: "FAILED" });
    expect((await store.mustGetJob(e.db, h.jobId)).status).toBe("PARTIALLY_RELEASED");
    expect(e.paypal.capturedOn(h.authId)).toBe(31000);
    expect((await e.paypal.getAuthorization(h.authId)).status).toBe("PARTIALLY_CAPTURED");

    // Fix it, prove it, get paid.
    e.verifier.script.delete(h.lines.L4!.id);
    expect((await prove(e, h, "L4")).verdict).toBe("VERIFIED");
    await requestRelease(e, h.jobId, h.trades);
    await approveAll(h, ["L4"]);
    expect(await release(e, h.jobId)).toMatchObject({ kind: "captured", amountCents: 11000 });

    const caps = e.paypal.calls.filter((c) => c.op === "captureAuthorization").map((c) => c.args[1] as { amountCents: number; finalCapture: boolean; invoiceId: string });
    expect(caps.map((c) => [c.amountCents, c.finalCapture])).toEqual([[31000, false], [11000, true]]);
    expect(caps.map((c) => c.invoiceId)).toEqual([`${h.jobId}-r1`, `${h.jobId}-r2`]);
    expect((await store.mustGetJob(e.db, h.jobId)).status).toBe("COMPLETED");
    expect((await e.paypal.getAuthorization(h.authId)).status).toBe("CAPTURED");
    const types = (await store.getEvents(e.db, h.jobId)).map((x) => x.type);
    expect(types.filter((t) => t === "CAPTURED")).toHaveLength(2);
    expect(types).not.toContain("VOIDED");
  });

  it("lets silence approve only Verified lines once the review window lapses", async () => {
    const h = await heldJob(e);
    e.verifier.script.set(h.lines.L2!.id, [{ confidence: 0.55 }]);
    await prove(e, h, "L1");
    expect((await prove(e, h, "L2")).verdict).toBe("NEEDS_REVIEW");
    const { dueAt } = await requestRelease(e, h.jobId, h.trades);
    expect(dueAt.getTime() - e.clock.t.getTime()).toBe(43_200_000);

    e.clock.t = new Date(dueAt.getTime() - 1000);
    expect((await autoRelease(e)).approved).toBe(0);
    e.clock.t = new Date(dueAt.getTime() + 1000);
    const out = await autoRelease(e);
    expect(out.approved).toBe(1);
    expect(out.released[0]).toMatchObject({ kind: "captured", amountCents: 12000 });
    expect(await lineStatus(e, h)).toMatchObject({ L1: "CAPTURED", L2: "NEEDS_REVIEW" });
  });

  it("puts a flagged line back to the tradesperson and needs a note", async () => {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await expect(decideLine(e, h.lines.L1!.id, h.home, { approve: false, note: " " })).rejects.toThrow(EngineError);
    await decideLine(e, h.lines.L1!.id, h.home, { approve: false, note: "still drips at night" });
    expect(await lineStatus(e, h)).toMatchObject({ L1: "FLAGGED" });
    expect(await release(e, h.jobId)).toEqual({ kind: "nothing" });
    expect((await prove(e, h, "L1")).verdict).toBe("VERIFIED");
  });

  it("only the homeowner approves, only the tradesperson proves", async () => {
    const h = await heldJob(e);
    await expect(decideLine(e, h.lines.L1!.id, h.trades, { approve: true })).rejects.toMatchObject({ code: "forbidden" });
    await expect(requestRelease(e, h.jobId, h.home)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("retries a capture whose response was lost with the same request ID, and never captures twice", async () => {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    e.paypal.loseNextResponse("captureAuthorization");
    const r = await release(e, h.jobId);
    expect(r.kind).toBe("sending");
    // The line is reserved, so a second release can't take it again.
    expect(await release(e, h.jobId)).toEqual({ kind: "nothing" });
    // Too fresh for the worker's 30 s window; a 0 s window picks it up.
    expect(await retrySendingCaptures(e)).toEqual([]);
    const retried = await retrySendingCaptures(e, 0);
    expect(retried[0]).toMatchObject({ kind: "captured", amountCents: 12000 });
    expect(e.paypal.captures.size).toBe(1);
    const ids = e.paypal.calls.filter((c) => c.op === "captureAuthorization").map((c) => c.args[2]);
    expect(new Set(ids).size).toBe(1);
    expect(await lineStatus(e, h)).toMatchObject({ L1: "CAPTURED" });
  });

  it("refuses two releases at once from taking the same lines", async () => {
    const h = await heldJob(e);
    for (const c of ["L1", "L2"]) await prove(e, h, c);
    await approveAll(h, ["L1", "L2"]);
    const out = await Promise.all([release(e, h.jobId), release(e, h.jobId)]);
    expect(out.map((o) => o.kind).sort()).toEqual(["captured", "nothing"]);
    expect(e.paypal.capturedOn(h.authId)).toBe(21000);
  });

  it("says nothing was charged when PayPal refuses, and lets the lines go again", async () => {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    e.paypal.expire(h.authId);
    const r = await release(e, h.jobId);
    expect(r).toMatchObject({ kind: "failed", reason: "the hold is voided at PayPal" });
    const line = await store.getLine(e.db, h.lines.L1!.id);
    expect(line).toMatchObject({ status: "APPROVED", capture_id: null });
    const ev = (await store.getEvents(e.db, h.jobId)).find((x) => x.type === "CAPTURE_FAILED");
    expect(ev?.data).toMatchObject({ charged: false });
  });

  it("closes with a dropped line: captures what is approved as final, no void needed", async () => {
    const h = await heldJob(e);
    for (const c of ["L1", "L2", "L3"]) await prove(e, h, c);
    await approveAll(h, ["L1", "L2"]);
    await release(e, h.jobId);
    await approveAll(h, ["L3"]);
    const drop = [h.lines.L4!.id];
    expect(await confirmClose(e, h.jobId, h.trades, drop)).toEqual({ kind: "waiting", for: "homeowner" });
    const out = await confirmClose(e, h.jobId, h.home, drop);
    expect(out).toMatchObject({ kind: "closed", voided: false, release: { kind: "captured", amountCents: 10000 } });
    expect(await lineStatus(e, h)).toEqual({ L1: "CAPTURED", L2: "CAPTURED", L3: "CAPTURED", L4: "DROPPED" });
    expect((await store.mustGetJob(e.db, h.jobId)).status).toBe("COMPLETED");
    expect((await e.paypal.getAuthorization(h.authId)).status).toBe("CAPTURED");
    expect(e.paypal.capturedOn(h.authId)).toBe(31000);
  });

  it("voids the remainder when the last open line is dropped after the rest were paid", async () => {
    const h = await heldJob(e);
    for (const c of ["L1", "L2", "L3"]) await prove(e, h, c);
    await approveAll(h, ["L1", "L2", "L3"]);
    await release(e, h.jobId);
    await confirmClose(e, h.jobId, h.trades, [h.lines.L4!.id]);
    expect(await confirmClose(e, h.jobId, h.home, [h.lines.L4!.id])).toMatchObject({ kind: "closed", voided: true, release: null });
    expect((await e.paypal.getAuthorization(h.authId)).status).toBe("VOIDED");
    expect((await store.mustGetJob(e.db, h.jobId)).status).toBe("COMPLETED");
    const voided = (await store.getEvents(e.db, h.jobId)).find((x) => x.type === "VOIDED");
    expect(voided?.data).toMatchObject({ released_cents: 11000 });
  });

  it("cancels a job before any work: everything dropped, the hold voided", async () => {
    const h = await heldJob(e);
    const all = Object.values(h.lines).map((l) => l.id);
    await confirmClose(e, h.jobId, h.home, all);
    await confirmClose(e, h.jobId, h.trades, all);
    expect((await store.mustGetJob(e.db, h.jobId)).status).toBe("CLOSED_VOIDED");
    expect((await e.paypal.getAuthorization(h.authId)).status).toBe("VOIDED");
  });

  it("restarts the close when one side changes which lines to drop", async () => {
    const h = await heldJob(e);
    await confirmClose(e, h.jobId, h.trades, [h.lines.L4!.id]);
    expect(await confirmClose(e, h.jobId, h.home, [h.lines.L3!.id])).toEqual({ kind: "waiting", for: "tradesperson" });
  });

  it("refuses to close while a line is still under review", async () => {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    const all = ["L2", "L3", "L4"].map((c) => h.lines[c]!.id);
    await confirmClose(e, h.jobId, h.trades, all);
    await expect(confirmClose(e, h.jobId, h.home, all)).rejects.toMatchObject({ code: "lines_open" });
  });

  it("reauthorizes once after the honor period, and later captures use the new ID", async () => {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await approveAll(h, ["L1"]);
    await release(e, h.jobId);
    e.clock.t = new Date(e.clock.t.getTime() + 2 * 86_400_000);
    expect((await reauthorizeDue(e)).reauthorized).toEqual([]);
    e.clock.t = new Date(e.clock.t.getTime() + 2 * 86_400_000);
    const out = await reauthorizeDue(e);
    expect(out.reauthorized).toHaveLength(1);
    const auth = (await store.getBaseAuthorization(e.db, h.jobId))!;
    expect(auth.paypal_auth_id).not.toBe(h.authId);
    expect((await reauthorizeDue(e)).reauthorized).toEqual([]);
    await prove(e, h, "L2");
    await approveAll(h, ["L2"]);
    expect(await release(e, h.jobId)).toMatchObject({ kind: "captured", amountCents: 9000 });
    const last = e.paypal.calls.filter((c) => c.op === "captureAuthorization").at(-1)!;
    expect(last.args[0]).toBe(auth.paypal_auth_id);
  });

  it("records a refused reauthorization once and alerts, instead of retrying forever", async () => {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await approveAll(h, ["L1"]);
    await release(e, h.jobId);
    e.paypal.allowReauthorizeAfterPartialCapture = false;
    e.clock.t = new Date(e.clock.t.getTime() + 4 * 86_400_000);
    expect((await reauthorizeDue(e)).failed).toHaveLength(1);
    expect((await reauthorizeDue(e)).failed).toHaveLength(0);
    const ev = (await store.getEvents(e.db, h.jobId)).find((x) => x.type === "REAUTHORIZE_FAILED");
    expect(ev?.data).toMatchObject({ alert: "both" });
  });
});

describe.skipIf(!TEST_DATABASE_URL)("engine: proof integrity", () => {
  let e: TestEngine;
  beforeEach(async () => {
    e = await testEngine();
  });
  afterEach(() => e.db.end());

  it("fails a photo taken away from the job without spending a model call", async () => {
    const h = await heldJob(e);
    const r = await prove(e, h, "L1", { gps: { lat: ANCHOR.lat + 0.01, lng: ANCHOR.lng, accuracyM: 5 } });
    expect(r.verdict).toBe("FAILED");
    expect(r.reasons[0]).toMatch(/m from the job, limit 150 m/);
    expect(e.verifier.calls).toHaveLength(0);
  });

  it("fails a photo already used on another line", async () => {
    const h = await heldJob(e);
    const photo = await testPhoto();
    expect((await prove(e, h, "L1", { photo })).verdict).toBe("VERIFIED");
    const again = await prove(e, h, "L2", { photo });
    expect(again).toMatchObject({ verdict: "FAILED", reasons: ["photo already used"] });
  });

  it("fails an after-photo that is the before-photo", async () => {
    const h = await heldJob(e);
    const before = (await store.getPhotos(e.db, h.jobId)).find((p) => p.kind === "before")!;
    const r = await prove(e, h, "L1", { photo: Buffer.from(await e.storage.get(before.storage_path)) });
    expect(r.reasons).toContain("after-photo matches before-photo");
  });

  it("rejects a used or missing capture token", async () => {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await expect(
      submitProof(e, { lineId: h.lines.L2!.id, tradesId: h.trades, photo: await testPhoto(), deviceId: DEVICE, gps: ANCHOR }),
    ).rejects.toMatchObject({ code: "not_proving" });
    const { issueCaptureToken } = await import("../src/index.ts");
    const { token } = await issueCaptureToken(e, h.lines.L2!.id, h.trades, DEVICE);
    e.clock.t = new Date(e.clock.t.getTime() + 121_000);
    await expect(
      submitProof(e, { lineId: h.lines.L2!.id, tradesId: h.trades, photo: await testPhoto(), deviceId: DEVICE, gps: ANCHOR, token }),
    ).rejects.toBeInstanceOf(TokenRejected);
  });

  it("sends a different device and poor GPS to review, not to verified", async () => {
    const h = await heldJob(e);
    const r = await prove(e, h, "L1", { gps: { ...ANCHOR, accuracyM: 160 } });
    expect(r.verdict).toBe("NEEDS_REVIEW");
  });

  it("re-runs a borderline line on a crop of its region", async () => {
    const h = await heldJob(e);
    e.verifier.script.set(h.lines.L1!.id, [{ confidence: 0.7, region: { x: 0.25, y: 0.25, w: 0.3, h: 0.3 } }, { confidence: 0.9 }]);
    const r = await prove(e, h, "L1");
    expect(r.verdict).toBe("VERIFIED");
    expect(e.verifier.calls).toHaveLength(2);
    expect(e.verifier.calls[1]!.crop).toBeInstanceOf(Buffer);
    const { rows } = await e.db.query("select pass, verdict from verdicts where line_id = $1 order by pass", [h.lines.L1!.id]);
    expect(rows).toEqual([{ pass: 1, verdict: "NEEDS_REVIEW" }, { pass: 2, verdict: "VERIFIED" }]);
  });

  it("takes judge-mode sample photos on a demo job only, still through the verifier", async () => {
    const real = await heldJob(e);
    await expect(
      submitProof(e, { lineId: real.lines.L1!.id, tradesId: real.trades, photo: await testPhoto(), deviceId: null, gps: null, sample: true }),
    ).rejects.toMatchObject({ code: "forbidden" });

    const demo = await heldJob(e, { demo: true });
    const r = await submitProof(e, { lineId: demo.lines.L1!.id, tradesId: demo.trades, photo: await testPhoto(), deviceId: null, gps: null, sample: true });
    expect(r.verdict).toBe("VERIFIED");
    expect(r.integrity.sample).toBe(true);
    expect(e.verifier.calls).toHaveLength(1);
    // One person plays both sides in judge mode.
    await decideLine(e, demo.lines.L1!.id, demo.home, { approve: true });
    expect(await release(e, demo.jobId)).toMatchObject({ kind: "captured", amountCents: 12000 });
  });
});
