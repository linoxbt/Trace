import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import { autoRelease, decideLine, expireLapsedHolds, release, releaseBeforeHoldLapses, requestRelease, warnExpiringHolds } from "../src/index.ts";
import { testEngine, type TestEngine } from "../src/testing.ts";
import { BATHROOM, heldJob, lineStatus, prove } from "./helpers.ts";

const DAY = 86_400_000;
// One line big enough for the $150 preset: an automatic release of it asks the homeowner first.
const BIG = [{ ...BATHROOM[0]!, priceCents: 20000 }, BATHROOM[1]!];

describe.skipIf(!TEST_DATABASE_URL)("engine: the end of a PayPal hold", () => {
  let e: TestEngine;
  beforeEach(async () => {
    e = await testEngine();
  });
  afterEach(() => e.db.end());

  const at = (start: Date, days: number) => new Date(start.getTime() + days * DAY);
  const events = async (jobId: string, type: string) => (await store.getEvents(e.db, jobId)).filter((x) => x.type === type);

  it("warns both sides once, three days before the hold lapses, naming the unpaid lines", async () => {
    const start = e.clock.t;
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    await release(e, h.jobId);

    e.clock.t = at(start, 25);
    expect(await warnExpiringHolds(e)).toBe(0);
    e.clock.t = at(start, 26.5);
    expect(await warnExpiringHolds(e)).toBe(1);
    expect(await warnExpiringHolds(e)).toBe(0);

    const [w] = await events(h.jobId, "HOLD_EXPIRING");
    expect(w!.data).toMatchObject({ lines: ["L2", "L3", "L4"], held_cents: 30000, alert: "both" });
  });

  it("doesn't warn about a hold that has nothing left to pay", async () => {
    const start = e.clock.t;
    const h = await heldJob(e);
    for (const c of ["L1", "L2", "L3", "L4"]) {
      await prove(e, h, c);
      await decideLine(e, h.lines[c]!.id, h.home, { approve: true });
    }
    await release(e, h.jobId);
    e.clock.t = at(start, 27);
    expect(await warnExpiringHolds(e)).toBe(0);
  });

  it("pays verified work the homeowner never answered for, in the hold's last day, through the guard", async () => {
    const start = e.clock.t;
    const h = await heldJob(e, { lines: BIG });
    await prove(e, h, "L1");
    await requestRelease(e, h.jobId, h.trades);

    // Silence approves the line, but the $150 preset asks the homeowner before paying it.
    e.clock.t = new Date(e.clock.t.getTime() + 13 * 3600_000);
    const auto = await autoRelease(e);
    expect(auto.approved).toBe(1);
    expect(auto.released[0]).toMatchObject({ kind: "needs_approval" });
    expect(e.paypal.capturedOn(h.authId)).toBe(0);

    // Two days out, nothing changes: the homeowner still has time to tap.
    e.clock.t = at(start, 27);
    expect(await releaseBeforeHoldLapses(e)).toEqual([]);

    // In the last 24 hours the preset stands aside, and the line is paid.
    e.clock.t = at(start, 28.5);
    const out = await releaseBeforeHoldLapses(e);
    expect(out).toEqual([expect.objectContaining({ kind: "captured", amountCents: 20000 })]);
    expect(e.paypal.capturedOn(h.authId)).toBe(20000);
    expect(await lineStatus(e, h)).toMatchObject({ L1: "CAPTURED", L2: "PENDING" });
    const decisions = await e.db.query<{ outcome: string }>("select outcome from guard_decisions where job_id = $1 order by id", [h.jobId]);
    expect(decisions.rows.map((r) => r.outcome)).toEqual(["REQUIRE_APPROVAL", "ALLOW"]);
  });

  it("never pays a flagged line, even in the hold's last day", async () => {
    const start = e.clock.t;
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: false, note: "still drips" });
    e.clock.t = at(start, 28.5);
    expect(await releaseBeforeHoldLapses(e)).toEqual([]);
    expect(e.paypal.capturedOn(h.authId)).toBe(0);
  });

  it("doesn't retry a refused last-day release every minute", async () => {
    const start = e.clock.t;
    const h = await heldJob(e, { lines: BIG });
    await prove(e, h, "L1");
    await requestRelease(e, h.jobId, h.trades);
    e.clock.t = new Date(e.clock.t.getTime() + 13 * 3600_000);
    await autoRelease(e);
    e.clock.t = at(start, 28.5);
    e.paypal.failNext("getAuthorization");
    expect((await releaseBeforeHoldLapses(e))[0]).toMatchObject({ kind: "blocked" });
    e.clock.t = new Date(e.clock.t.getTime() + 60_000);
    expect(await releaseBeforeHoldLapses(e)).toEqual([]);
    e.clock.t = new Date(e.clock.t.getTime() + 2 * 3600_000);
    expect((await releaseBeforeHoldLapses(e))[0]).toMatchObject({ kind: "captured", amountCents: 20000 });
  });

  it("records a lapsed hold and closes the job, even when PayPal's webhook never comes", async () => {
    const start = e.clock.t;
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    await release(e, h.jobId);

    // Past the date, but PayPal still holds it: nothing is recorded yet.
    e.clock.t = at(start, 29.1);
    expect(await expireLapsedHolds(e)).toBe(0);
    expect((await store.getBaseAuthorization(e.db, h.jobId))!.status).toBe("PARTIALLY_CAPTURED");

    e.paypal.lapse(h.authId);
    e.clock.t = new Date(e.clock.t.getTime() + 11 * 60_000);
    expect(await expireLapsedHolds(e)).toBe(1);
    expect((await store.getBaseAuthorization(e.db, h.jobId))!.status).toBe("VOIDED");
    expect((await store.mustGetJob(e.db, h.jobId)).status).toBe("COMPLETED");
    const [x] = await events(h.jobId, "HOLD_EXPIRED");
    expect(x!.data).toMatchObject({ released_cents: 30000, lines: ["L2", "L3", "L4"], alert: "both", paypal_status: "EXPIRED" });

    e.clock.t = new Date(e.clock.t.getTime() + 11 * 60_000);
    expect(await expireLapsedHolds(e)).toBe(0);
  });

  it("closes a job with nothing paid as voided when its hold lapses", async () => {
    const start = e.clock.t;
    const h = await heldJob(e);
    e.paypal.lapse(h.authId);
    e.clock.t = at(start, 29.2);
    expect(await expireLapsedHolds(e)).toBe(1);
    expect((await store.mustGetJob(e.db, h.jobId)).status).toBe("CLOSED_VOIDED");
  });
});
