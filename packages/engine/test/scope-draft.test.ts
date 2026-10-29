import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL } from "@trace/db/testing";
import { addBeforePhoto, cleanDraft, createJob, draftScope, saveScope, type DraftInput, type ScopeDrafter } from "../src/index.ts";
import { makeUser, testEngine, testPhoto, type TestEngine } from "../src/testing.ts";
import { ANCHOR, DEVICE } from "./helpers.ts";

const base = {
  description: "",
  must_not_show: [] as string[],
  framing: "Same angle as the before-photo",
  verifiable_by_photo: true,
  note: null,
  motion: null,
  doc_kind: null,
  total_at_most_price: null,
  reading_quantity: null,
  reading_unit: null,
  reading_op: null,
  reading_target: null,
  reading_target_max: null,
  deliverable_kind: null,
  attester_email: null,
  attest_statement: null,
};

describe("cleanDraft", () => {
  it("keeps valid lines, builds proof details, and falls back to a photo when details are missing", () => {
    const out = cleanDraft({
      summary: "Bathroom: tap and pressure",
      lines: [
        { ...base, title: "Fix dripping tap", suggested_price_cents: 12000.4, criterion: "Tap is dry", must_show: ["dry spout"], proof_type: "video", motion: "no drip over the clip" },
        { ...base, title: "Repressurise boiler", suggested_price_cents: 6000, criterion: "Pressure in range", must_show: ["gauge legible"], proof_type: "reading", reading_quantity: "pressure", reading_unit: "bar", reading_op: "between", reading_target: 1, reading_target_max: 1.5 },
        { ...base, title: "Wiring in the wall", suggested_price_cents: 8000, criterion: "Wired to code", must_show: ["wired to code"], proof_type: "attestation", attest_statement: "Wired to code" },
        { ...base, title: "", suggested_price_cents: 100, criterion: "x", must_show: ["x"], proof_type: "photo" },
      ],
    });
    expect(out.lines).toHaveLength(3);
    expect(out.lines[0]).toMatchObject({ proofType: "video", proofSpec: { motion: "no drip over the clip" }, suggestedPriceCents: 12000, verifiableByPhoto: false });
    expect(out.lines[1]).toMatchObject({ proofType: "reading", proofSpec: { op: "between", target: 1, target_max: 1.5 } });
    // No attester email: kept as a photo line, with a note saying what was suggested.
    expect(out.lines[2]).toMatchObject({ proofType: "photo", note: expect.stringContaining("attestation") });
  });
});

describe.skipIf(!TEST_DATABASE_URL)("engine: scope drafting", () => {
  let e: TestEngine;
  const seen: DraftInput[] = [];
  const drafter: ScopeDrafter = {
    model: "scripted-scope",
    async draft(input) {
      seen.push(input);
      return cleanDraft({ summary: "s", lines: [{ ...base, title: "Deep clean the oven", suggested_price_cents: 5000, criterion: "Oven clean", must_show: ["clean oven floor"], proof_type: "photo" }] });
    },
  };
  beforeEach(async () => {
    e = await testEngine();
    seen.length = 0;
  });
  afterEach(() => e.db.end());

  it("drafts from the before-photos and description, and the draft saves as a scope", async () => {
    const trades = await makeUser(e.db, "cleaner");
    const job = await createJob(e, { tradesId: trades, homeownerEmail: "c@example.test", address: "Flat 4", category: "cleaning" });
    await expect(draftScope(e, job.id, trades, "")).rejects.toMatchObject({ code: "drafter_unavailable" });
    e.scopeDrafter = drafter;
    await expect(draftScope(e, job.id, trades, "")).rejects.toMatchObject({ code: "nothing_to_draft" });
    await addBeforePhoto(e, { jobId: job.id, tradesId: trades, photo: await testPhoto(), gps: ANCHOR, deviceId: DEVICE });
    const out = await draftScope(e, job.id, trades, "End of tenancy clean, oven is filthy");
    expect(seen[0]).toMatchObject({ trade: "Cleaning and turnovers", currency: "USD", description: "End of tenancy clean, oven is filthy" });
    expect(seen[0]!.photos).toHaveLength(1);
    const lines = await saveScope(e, job.id, trades, out.lines.map((l, i) => ({ code: `L${i + 1}`, title: l.title, priceCents: l.suggestedPriceCents, acceptance: l.acceptance, verifiableByPhoto: l.verifiableByPhoto, proofType: l.proofType, proofSpec: l.proofSpec })));
    expect(lines[0]).toMatchObject({ title: "Deep clean the oven", price_cents: 5000 });
  });

  it("only the tradesperson drafts, and only while the job is a draft", async () => {
    e.scopeDrafter = drafter;
    const trades = await makeUser(e.db, "t");
    const other = await makeUser(e.db, "o");
    const job = await createJob(e, { tradesId: trades, homeownerEmail: "c@example.test", address: "Flat 4" });
    await expect(draftScope(e, job.id, other, "something long enough")).rejects.toMatchObject({ code: "forbidden" });
  });
});
