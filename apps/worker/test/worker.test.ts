import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "@trace/db";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import { requestRelease } from "@trace/engine";
import { testEngine, type TestEngine } from "@trace/engine/testing";
import { heldJob, prove } from "../../../packages/engine/test/helpers.ts";
import { loadConfig } from "../src/config.ts";
import { tick } from "../src/tick.ts";

describe("worker config", () => {
  const env = { DATABASE_URL: "postgres://x", PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "s", PAYPAL_WEBHOOK_ID: "wh" };

  it("defaults to the sandbox and a 30 s tick", () => {
    expect(loadConfig(env)).toMatchObject({ paypalApiBase: "https://api-m.sandbox.paypal.com", tickMs: 30_000, demoMode: false });
  });

  it("names what is missing", () => {
    expect(() => loadConfig({ DATABASE_URL: "postgres://x" })).toThrow(/PAYPAL_CLIENT_ID/);
  });

  it("refuses demo mode against live PayPal", () => {
    expect(() => loadConfig({ ...env, DEMO_MODE: "true", PAYPAL_API_BASE: "https://api-m.paypal.com" })).toThrow(/sandbox only/);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("worker tick", () => {
  let e: TestEngine;
  beforeEach(async () => {
    e = await testEngine();
  });
  afterEach(() => e.db.end());

  it("auto-releases lapsed Verified lines and is a no-op when run again", async () => {
    const h = await heldJob(e);
    await prove(e, h, "L1");
    const { dueAt } = await requestRelease(e, h.jobId, h.trades);
    e.clock.t = new Date(dueAt.getTime() + 1);
    expect(await tick(e)).toMatchObject({ approved: 1, released: 1, retried: 0 });
    expect(await tick(e)).toMatchObject({ approved: 0, released: 0 });
    expect((await store.getLine(e.db, h.lines.L1!.id))?.status).toBe("CAPTURED");
  });
});
