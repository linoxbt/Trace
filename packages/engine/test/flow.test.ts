import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import {
  autoRelease,
  confirmClose,
  cropRegion,
  dHash,
  normalizePhoto,
  decideLine,
  EngineError,
  reauthorizeDue,
  release,
  requestRelease,
  retrySendingCaptures,
  settleCapture,
  submitProof,
  TokenRejected,
} from "../src/index.ts";
import type { Capture } from "@trace/paypal";
import sharp from "sharp";
import { hamming, SAME_IMAGE_HAMMING } from "@trace/core";
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

  it("releases a hold whose order comes back naming no payee: it might not pay the tradesperson", async () => {
    await expect(
      heldJob(e, {
        beforeAuthorize: (orderId) => {
          e.paypal.orders.get(orderId)!.input.payeeMerchantId = undefined;
        },
      }),
    ).rejects.toMatchObject({ code: "payee_mismatch" });
    expect([...e.paypal.auths.values()].map((a) => a.status)).toEqual(["VOIDED"]);
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

  it("never releases hidden work on silence: a during-photo goes to the client", async () => {
    const h = await heldJob(e);
    await e.db.query("update lines set verifiable_by_photo = false where id = $1", [h.lines.L1!.id]);
    const r = await prove(e, h, "L1");
    expect(r.verdict).toBe("NEEDS_REVIEW");
    expect(r.reasons.join(" ")).toMatch(/hidden work/);
    expect((await lineStatus(e, h)).L1).toBe("NEEDS_REVIEW");
  });

  it("judges each line against the closest of the job's before-photos", async () => {
    const h = await heldJob(e);
    // A second area's before-photo, taken while the job was a draft.
    const second = await normalizePhoto(await testPhoto(4242));
    const secondHash = await dHash(second);
    await e.storage.put(`jobs/${h.jobId}/before/second.jpg`, second, "image/jpeg");
    await store.insertPhoto(e.db, {
      job_id: h.jobId, line_id: null, kind: "before", storage_path: `jobs/${h.jobId}/before/second.jpg`, dhash: secondHash,
      lat: ANCHOR.lat, lng: ANCHOR.lng, gps_accuracy_m: 5, capture_token: null, device_id: DEVICE, sample: false, taken_at: new Date(Date.now() + 1000),
    });
    const picked = await store.beforePhotoFor(e.db, h.lines.L2!, { dhash: secondHash });
    expect(picked?.dhash).toBe(secondHash);
    // Without an after-photo to compare, the first before-photo, as before.
    expect((await store.beforePhotoFor(e.db, h.lines.L2!))?.dhash).not.toBe(secondHash);
  });

  it("lets a line be re-proved after a failed check, but not with the very same image", async () => {
    const h = await heldJob(e);
    e.verifier.script.set(h.lines.L1!.id, failing("water drops at the spout", "drops visible"));
    const photo = await testPhoto(777);
    expect((await prove(e, h, "L1", { photo })).verdict).toBe("FAILED");
    e.verifier.script.delete(h.lines.L1!.id);
    const same = await prove(e, h, "L1", { photo });
    expect(same).toMatchObject({ verdict: "FAILED" });
    expect(same.integrity.checks.find((c) => c.name === "reuse")?.result).toBe("fail");
    // A retake from the same spot: nearly the same picture, a little darker.
    const again = await sharp(photo).modulate({ brightness: 0.8 }).jpeg().toBuffer();
    expect(hamming(await dHash(await normalizePhoto(photo)), await dHash(await normalizePhoto(again)))).toBeLessThanOrEqual(SAME_IMAGE_HAMMING);
    const retake = await prove(e, h, "L1", { photo: again });
    expect(retake.integrity.checks.find((c) => c.name === "reuse")?.result).toBe("pass");
    expect(retake.verdict).toBe("VERIFIED");
  });

  it("crops for the second look inside the image, even for a region at the very edge", async () => {
    const photo = await normalizePhoto(await testPhoto(31));
    for (const region of [{ x: 1, y: 0.995, w: 0, h: 0 }, { x: 0.99, y: 0.99, w: 0.5, h: 0.5 }, { x: 0, y: 0, w: 1, h: 1 }]) {
      await expect(cropRegion(photo, region)).resolves.toBeInstanceOf(Buffer);
    }
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
    // Too fresh for the worker's window; a 0 s window picks it up.
    expect(await retrySendingCaptures(e)).toEqual([]);
    const retried = await retrySendingCaptures(e, 0);
    expect(retried[0]).toMatchObject({ kind: "captured", amountCents: 12000 });
    expect(e.paypal.captures.size).toBe(1);
    const ids = e.paypal.calls.filter((c) => c.op === "captureAuthorization").map((c) => c.args[2]);
    expect(new Set(ids).size).toBe(1);
    expect(await lineStatus(e, h)).toMatchObject({ L1: "CAPTURED" });
  });

  it("an unexpected error during a capture keeps it sending instead of freeing the lines", async () => {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    e.paypal.failNext("captureAuthorization", new TypeError("body stream already read"));
    expect((await release(e, h.jobId)).kind).toBe("sending");
    // The line stays reserved: a second release can't capture it again under a new request.
    expect(await release(e, h.jobId)).toEqual({ kind: "nothing" });
  });

  it("won't drop a line whose payment is still on its way to PayPal", async () => {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    e.paypal.loseNextResponse("captureAuthorization");
    expect((await release(e, h.jobId)).kind).toBe("sending");
    const all = ["L1", "L2", "L3", "L4"].map((c) => h.lines[c]!.id);
    await expect(confirmClose(e, h.jobId, h.trades, all)).rejects.toMatchObject({ code: "capture_in_flight" });
  });

  it("a capture that lands after the job closed is recorded without reopening the hold", async () => {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    e.paypal.loseNextResponse("captureAuthorization");
    const r = await release(e, h.jobId);
    if (r.kind !== "sending") throw new Error(r.kind);
    // PayPal voids the hold (it expired) while the capture's outcome is still unknown.
    await e.db.query("update authorizations set status = 'VOIDED' where paypal_auth_id = $1", [h.authId]);
    await e.db.query("update jobs set status = 'CLOSED_VOIDED' where id = $1", [h.jobId]);
    const pp = [...e.paypal.captures.values()][0]!;
    await settleCapture(e, r.captureId, { ...pp, status: "COMPLETED" } as Capture);
    expect((await store.getBaseAuthorization(e.db, h.jobId))!.status).toBe("VOIDED");
    expect((await store.mustGetJob(e.db, h.jobId)).status).toBe("COMPLETED");
    expect((await store.getEvents(e.db, h.jobId)).map((x) => x.type)).toContain("LATE_CAPTURE");
  });

  it("after the last resend, asks PayPal's order: a capture it has is settled, one it doesn't frees the lines", async () => {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    // Never reached PayPal at all.
    e.paypal.failNext("captureAuthorization");
    expect((await release(e, h.jobId)).kind).toBe("sending");
    await e.db.query("update captures set attempts = $1 where status = 'SENDING'", [store.MAX_CAPTURE_SENDS]);
    // PayPal can't be read: both sides are told, once.
    e.paypal.failNext("getOrder");
    await retrySendingCaptures(e, 0);
    await retrySendingCaptures(e, 0).catch(() => undefined);
    expect((await store.getEvents(e.db, h.jobId)).filter((x) => x.type === "CAPTURE_STUCK").length).toBeLessThanOrEqual(1);
    // PayPal answers: no such capture, so nothing was charged and the line can be released again.
    const capId = (await e.db.query<{ id: string }>("select id from captures where status in ('SENDING','FAILED')")).rows[0]!.id;
    const cap = (await e.db.query<{ status: string }>("select status from captures where id = $1", [capId])).rows[0]!;
    expect(cap.status).toBe("FAILED");
    expect(await lineStatus(e, h)).toMatchObject({ L1: "APPROVED" });
    expect((await release(e, h.jobId)).kind).toBe("captured");
  });

  it("counts a capture's sends once each: eight resends, not four", async () => {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    e.paypal.failNext("captureAuthorization");
    await release(e, h.jobId);
    for (let i = 0; i < 3; i++) {
      e.paypal.failNext("captureAuthorization");
      await retrySendingCaptures(e, 0);
    }
    expect((await e.db.query<{ attempts: number }>("select attempts from captures")).rows[0]!.attempts).toBe(4);
  });

  it("two workers retrying at once send a lost capture only once", async () => {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    e.paypal.loseNextResponse("captureAuthorization");
    await release(e, h.jobId);
    await e.db.query("update captures set updated_at = now() - interval '5 minutes' where status = 'SENDING'");
    // PayPal answers slowly, so the two workers overlap while the first resend is in flight.
    const capture = e.paypal.captureAuthorization.bind(e.paypal);
    e.paypal.captureAuthorization = async (...args) => {
      await new Promise((r) => setTimeout(r, 200));
      return capture(...args);
    };
    const [a, b] = await Promise.all([retrySendingCaptures(e), retrySendingCaptures(e)]);
    expect([...a, ...b]).toHaveLength(1);
    // The lost first send, and exactly one resend.
    expect(e.paypal.calls.filter((c) => c.op === "captureAuthorization")).toHaveLength(2);
    expect(await lineStatus(e, h)).toMatchObject({ L1: "CAPTURED" });
  });

  it("claims a stale capture for a resend atomically: one claimant wins, a fresh one isn't taken", async () => {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    e.paypal.loseNextResponse("captureAuthorization");
    const r = await release(e, h.jobId);
    if (r.kind !== "sending") throw new Error(r.kind);
    // Just sent: still inside the window where the original request may be waiting on PayPal.
    expect(await store.claimStaleCapture(e.db, r.captureId, 90)).toBeNull();
    await e.db.query("update captures set updated_at = now() - interval '5 minutes' where id = $1", [r.captureId]);
    const claims = await Promise.all(Array.from({ length: 5 }, () => store.claimStaleCapture(e.db, r.captureId, 90)));
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("refuses two releases at once from taking the same lines", async () => {
    const h = await heldJob(e);
    for (const c of ["L1", "L2"]) await prove(e, h, c);
    await approveAll(h, ["L1", "L2"]);
    const out = await Promise.all([release(e, h.jobId), release(e, h.jobId)]);
    expect(out.map((o) => o.kind).sort()).toEqual(["captured", "nothing"]);
    expect(e.paypal.capturedOn(h.authId)).toBe(21000);
  });

  it("settles a capture behind the job lock, so it can't deadlock with a release", async () => {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    e.paypal.loseNextResponse("captureAuthorization");
    const r = await release(e, h.jobId);
    if (r.kind !== "sending") throw new Error(`expected a capture in flight, got ${r.kind}`);
    const paypalId = [...e.paypal.captures.keys()][0]!;

    // Hold the job row the way a release does, then let the settle start.
    let settle!: Promise<unknown>;
    await e.db.tx(async (q) => {
      await store.mustGetJob(q, h.jobId, { lock: true });
      settle = settleCapture(e, r.captureId, { id: paypalId, status: "COMPLETED" } as Capture);
      await q.query("select pg_sleep(0.3)");
      // A release takes the authorization next. The settle must not be holding it.
      await q.query("select 1 from authorizations where id = (select authorization_id from captures where id = $1) for update nowait", [r.captureId]);
    });
    await settle;
    expect(await lineStatus(e, h)).toMatchObject({ L1: "CAPTURED" });
  });

  it("blocks a release before PayPal is asked when the hold is no longer live (B4), and keeps the lines", async () => {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    e.paypal.expire(h.authId);
    const r = await release(e, h.jobId);
    expect(r).toMatchObject({ kind: "blocked", reasons: ["Release of $120.00 blocked.", "The hold is voided at PayPal."] });
    expect(e.paypal.calls.filter((c) => c.op === "captureAuthorization")).toHaveLength(0);
    const line = await store.getLine(e.db, h.lines.L1!.id);
    expect(line).toMatchObject({ status: "APPROVED", capture_id: null });
    const ev = (await store.getEvents(e.db, h.jobId)).find((x) => x.type === "GUARD_BLOCKED");
    expect(ev?.data).toMatchObject({ action: "CAPTURE", amount_cents: 12000 });
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

  it("sends the before-photo with the fix painted on to the client, not to Verified", async () => {
    const h = await heldJob(e);
    // The job's before-photo, as the tradesperson could download it, with one area painted over.
    const before = [...e.storage.files.entries()].find(([k]) => k.includes("/before/"))![1].bytes;
    const meta = await sharp(before).metadata();
    const patch = await sharp({ create: { width: Math.round(meta.width! / 5), height: Math.round(meta.height! / 5), channels: 3, background: "#e8e8e8" } }).jpeg().toBuffer();
    const edited = await sharp(before).composite([{ input: patch, left: Math.round(meta.width! / 2), top: Math.round(meta.height! / 2) }]).jpeg({ quality: 88 }).toBuffer();
    const r = await prove(e, h, "L1", { photo: edited });
    expect(r.verdict).toBe("NEEDS_REVIEW");
    expect(r.integrity.checks.find((c) => c.name === "edited_copy")).toMatchObject({ result: "review" });
    // A genuinely new photo isn't flagged.
    const fresh = await prove(e, h, "L2");
    expect(fresh.integrity.checks.find((c) => c.name === "edited_copy")).toBeUndefined();
  });

  it("caps photo retries: the last failed try goes to the client, then no more tries", async () => {
    const h = await heldJob(e);
    e.verifier.script.set(h.lines.L1!.id, failing("water drops at the spout", "drops at the spout"));
    let last;
    for (let i = 0; i < 8; i++) last = await prove(e, h, "L1");
    expect(last).toMatchObject({ verdict: "NEEDS_REVIEW", reasons: expect.arrayContaining([expect.stringContaining("the client decides")]) });
    await expect(prove(e, h, "L1")).rejects.toThrow();
  });

  it("the same photo sent to two lines at once: only the first one counts", async () => {
    const h = await heldJob(e);
    const photo = await testPhoto();
    const [a, b] = await Promise.all([prove(e, h, "L1", { photo }), prove(e, h, "L2", { photo })]);
    expect([a.verdict, b.verdict].sort()).toEqual(["FAILED", "VERIFIED"]);
  });

  it("a photo that only looks like one from another job goes to the client, not to Failed", async () => {
    const h = await heldJob(e);
    const photo = await testPhoto();
    expect((await prove(e, h, "L1", { photo })).verdict).toBe("VERIFIED");
    // Another job's honest, similar shot: same hash, different pixels.
    const h2 = await heldJob(e);
    const similar = await sharp(photo).modulate({ brightness: 1.25 }).jpeg().toBuffer();
    const r = await prove(e, h2, "L1", { photo: similar });
    expect(r.integrity.checks.find((c) => c.name === "reuse")).toMatchObject({ result: "review" });
    expect(r.verdict).toBe("NEEDS_REVIEW");
  });

  it("a redo the client asks for (a flag) starts the try count again", async () => {
    const h = await heldJob(e);
    e.verifier.script.set(h.lines.L1!.id, failing("water drops at the spout", "drops at the spout"));
    for (let i = 0; i < 8; i++) await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: false, note: "still dripping, please redo" });
    e.verifier.script.delete(h.lines.L1!.id);
    expect((await prove(e, h, "L1")).verdict).toBe("VERIFIED");
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
