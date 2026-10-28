import { describe, expect, it } from "vitest";
import { scopeHash, type ScopeLine } from "../src/index.ts";

const line: ScopeLine = {
  code: "L1",
  title: "Fix dripping tap",
  priceCents: 12000,
  acceptance: { criterion: "Tap closed, no drip", must_show: ["dry spout"], must_not_show: ["water drops"], framing: "Close up" },
  verifiableByPhoto: true,
};

describe("scopeHash", () => {
  it("is stable under key order and changes with any term", () => {
    const a = scopeHash({ jobId: "j", currency: "USD", lines: [line] });
    const reordered = { verifiableByPhoto: true, acceptance: { framing: "Close up", must_not_show: ["water drops"], must_show: ["dry spout"], criterion: "Tap closed, no drip" }, priceCents: 12000, title: "Fix dripping tap", code: "L1" };
    expect(scopeHash({ jobId: "j", currency: "USD", lines: [reordered] })).toBe(a);
    expect(scopeHash({ jobId: "j", currency: "USD", lines: [{ ...line, priceCents: 12001 }] })).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
