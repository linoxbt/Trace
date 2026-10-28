import { describe, expect, it } from "vitest";
import { combinePasses, decideVerdict, evaluateIntegrity, needsSecondPass, type Acceptance, type LineObservation } from "../src/index.ts";

const acceptance: Acceptance = {
  criterion: "Grout lines between the tiles are complete and uncracked",
  must_show: ["continuous grout in every joint"],
  must_not_show: ["visible cracks in the grout"],
  framing: "Same angle as the before-photo, 1 m away",
};
const ok = evaluateIntegrity({
  sample: false,
  tokenValid: true,
  gps: { lat: 1, lng: 1, accuracyM: 5 },
  anchor: { lat: 1, lng: 1 },
  dhash: "ffff0000ffff0000",
  beforeDhash: "0000ffff0000ffff",
  nearestOtherHamming: null,
  sameDevice: true,
});
const obs = (o: Partial<LineObservation> = {}): LineObservation => ({
  line_id: "L4",
  same_location: "yes",
  recapture: "no",
  checks: [
    { check: "continuous grout in every joint", kind: "must_show", satisfied: true, observation: "all joints filled" },
    { check: "visible cracks in the grout", kind: "must_not_show", satisfied: true, observation: "no cracks" },
  ],
  confidence: 0.9,
  homeowner_reason: "The grout is complete.",
  ...o,
});

describe("verdict policy", () => {
  it("verifies only with everything satisfied, same place, 0.80+", () => {
    expect(decideVerdict(acceptance, obs(), ok).verdict).toBe("VERIFIED");
    expect(decideVerdict(acceptance, obs({ confidence: 0.79 }), ok).verdict).toBe("NEEDS_REVIEW");
  });

  it("fails an unsatisfied check when sure", () => {
    const o = obs({ checks: [obs().checks[0]!, { check: "visible cracks in the grout", kind: "must_not_show", satisfied: false, observation: "crack top left" }] });
    const d = decideVerdict(acceptance, o, ok);
    expect(d.verdict).toBe("FAILED");
    expect(d.reasons[0]).toContain("crack top left");
  });

  it("fails a different place, reviews an uncertain one", () => {
    expect(decideVerdict(acceptance, obs({ same_location: "no" }), ok).verdict).toBe("FAILED");
    expect(decideVerdict(acceptance, obs({ same_location: "uncertain" }), ok).verdict).toBe("NEEDS_REVIEW");
  });

  it("reviews a likely photo of a screen", () => {
    expect(decideVerdict(acceptance, obs({ recapture: "yes" }), ok).verdict).toBe("NEEDS_REVIEW");
  });

  it("never verifies a check the model skipped", () => {
    const d = decideVerdict(acceptance, obs({ checks: [obs().checks[0]!] }), ok);
    expect(d.verdict).toBe("NEEDS_REVIEW");
    expect(d.reasons.join()).toContain("not checked");
  });

  it("follows failed integrity whatever the model says", () => {
    const bad = evaluateIntegrity({ ...ok, sample: false, tokenValid: true, gps: null, anchor: null, dhash: "0000ffff0000ffff", beforeDhash: "0000ffff0000ffff", nearestOtherHamming: null, sameDevice: true });
    expect(decideVerdict(acceptance, obs(), bad).verdict).toBe("FAILED");
  });

  it("honours a raised threshold", () => {
    expect(decideVerdict(acceptance, obs({ confidence: 0.82 }), ok, 0.85).verdict).toBe("NEEDS_REVIEW");
  });

  it("runs a second pass on borderline confidence, and disagreement goes to review", () => {
    const first = obs({ confidence: 0.7 });
    expect(needsSecondPass(first)).toBe(true);
    expect(needsSecondPass(obs({ confidence: 0.5 }))).toBe(false);
    expect(combinePasses(acceptance, first, obs({ confidence: 0.9 }), ok).verdict).toBe("VERIFIED");
    const flipped = obs({ confidence: 0.95, checks: [obs().checks[0]!, { ...obs().checks[1]!, satisfied: false }] });
    expect(combinePasses(acceptance, first, flipped, ok)).toEqual({ verdict: "NEEDS_REVIEW", reasons: ["the two inspection passes disagree"] });
  });
});
