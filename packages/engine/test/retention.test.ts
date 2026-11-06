import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import { confirmClose, decideLine, proofDeletedAt, purgeExpiredProof, release } from "../src/index.ts";
import { testEngine, type TestEngine } from "../src/testing.ts";
import { heldJob, prove } from "./helpers.ts";

const DAY = 86_400_000;

describe.skipIf(!TEST_DATABASE_URL)("engine: proof retention", () => {
  let e: TestEngine;
  beforeEach(async () => {
    e = await testEngine();
  });
  afterEach(() => e.db.end());

  const blobs = async (jobId: string) => [...e.storage.files.keys()].filter((k) => k.startsWith(`job/${jobId}/`)).length;

  async function closedJob() {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    await decideLine(e, h.lines.L1!.id, h.home, { approve: true });
    await release(e, h.jobId);
    const drop = ["L2", "L3", "L4"].map((c) => h.lines[c]!.id);
    await confirmClose(e, h.jobId, h.trades, drop);
    await confirmClose(e, h.jobId, h.home, drop);
    expect((await store.mustGetJob(e.db, h.jobId)).status).toBe("COMPLETED");
    return h;
  }

  it("deletes a closed job's photos 180 days after its last activity, once, and keeps the record", async () => {
    const h = await closedJob();
    expect(await blobs(h.jobId)).toBeGreaterThan(0);
    // Not yet.
    e.clock.t = new Date(Date.now() + 179 * DAY);
    expect(await purgeExpiredProof(e)).toEqual([]);

    e.clock.t = new Date(Date.now() + 181 * DAY);
    expect(await purgeExpiredProof(e)).toEqual([h.jobId]);
    expect(await blobs(h.jobId)).toBe(0);
    expect((await e.db.query("select lat from photos where job_id = $1 and lat is not null", [h.jobId])).rowCount).toBe(0);
    expect(await proofDeletedAt(e, h.jobId)).not.toBeNull();
    // The record stays.
    expect((await store.getLines(e.db, h.jobId)).find((l) => l.code === "L1")!.status).toBe("CAPTURED");
    expect((await e.db.query("select 1 from verdicts v join lines l on l.id = v.line_id where l.job_id = $1", [h.jobId])).rowCount).toBeGreaterThan(0);
    expect(await purgeExpiredProof(e)).toEqual([]);
  });

  it("clears a job that never went ahead after 90 days, with its location", async () => {
    const h = await heldJob(e);
    await e.db.query("update jobs set status = 'AWAITING_APPROVAL' where id = $1", [h.jobId]);
    e.clock.t = new Date(Date.now() + 91 * DAY);
    expect(await purgeExpiredProof(e)).toEqual([h.jobId]);
    expect((await store.mustGetJob(e.db, h.jobId)).anchor_lat).toBeNull();
  });

  it("keeps an open job's photos, and a closed job's while a dispute on it is open", async () => {
    const open = await heldJob(e);
    const h = await closedJob();
    await e.db.query("insert into disputes (job_id, paypal_dispute_id, status) values ($1, 'PP-D-1', 'OPEN')", [h.jobId]);
    e.clock.t = new Date(Date.now() + 400 * DAY);
    expect(await purgeExpiredProof(e)).toEqual([]);
    expect(await blobs(open.jobId)).toBeGreaterThan(0);
    await e.db.query("update disputes set status = 'RESOLVED' where job_id = $1", [h.jobId]);
    expect(await purgeExpiredProof(e)).toEqual([h.jobId]);
  });
});
