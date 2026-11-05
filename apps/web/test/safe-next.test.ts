import { describe, expect, it } from "vitest";
import { safeNext } from "../src/lib/safe-next.ts";

const SITE = "https://trace-proof.netlify.app";

describe("safeNext: where sign-in may send you", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/jobs/new?type=cleaning", SITE)).toBe("/jobs/new?type=cleaning");
    expect(safeNext("/attest/abc123", SITE)).toBe("/attest/abc123");
    expect(safeNext(null, SITE)).toBe("/dashboard");
  });

  it("never leaves the site, however the path is spelled", () => {
    for (const evil of ["//evil.example", "/\\evil.example", "/\\\\evil.example", "/%5Cevil.example", "https://evil.example/", "javascript:alert(1)", "/\t/evil.example", "evil.example"]) {
      const out = safeNext(evil, SITE);
      expect(new URL(out, SITE).origin, evil).toBe(SITE);
    }
  });
});
