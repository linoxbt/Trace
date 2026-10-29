import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CATEGORIES, JOB_CATEGORIES, categoryOf } from "@trace/core";
import { Acceptance } from "@trace/core";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import { createJob } from "../src/index.ts";
import { makeUser, testEngine, type TestEngine } from "../src/testing.ts";

describe("job types", () => {
  it("every type's starting lines are valid acceptance and fit a scope", () => {
    for (const id of JOB_CATEGORIES) {
      const c = CATEGORIES[id];
      expect(c.templates.length).toBeGreaterThan(0);
      expect(c.templates.length).toBeLessThanOrEqual(8);
      for (const t of c.templates) {
        expect(t.title.length).toBeLessThanOrEqual(60);
        expect(t.priceCents).toBeGreaterThan(0);
        expect(Acceptance.safeParse({ criterion: t.criterion, must_show: t.mustShow, must_not_show: t.mustNotShow, framing: t.framing }).success).toBe(true);
      }
    }
    expect(categoryOf("nonsense").id).toBe("home_repair");
  });
});

describe.skipIf(!TEST_DATABASE_URL)("engine: job types", () => {
  let e: TestEngine;
  beforeEach(async () => {
    e = await testEngine();
  });
  afterEach(() => e.db.end());

  it("stores the job type, defaults to home repair, and refuses unknown ones", async () => {
    const trades = await makeUser(e.db, "trades");
    const base = { tradesId: trades, homeownerEmail: "client@example.test", address: "4 Bourdillon Road" };
    expect((await createJob(e, { ...base, category: "cleaning" })).category).toBe("cleaning");
    expect((await createJob(e, base)).category).toBe("home_repair");
    await expect(createJob(e, { ...base, category: "rocket_science" })).rejects.toMatchObject({ code: "bad_category" });
  });
});
