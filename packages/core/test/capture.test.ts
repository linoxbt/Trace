import { describe, expect, it } from "vitest";
import { OverCapture, planClose, planRelease, type MoneyLine } from "../src/index.ts";

const L = (id: string, status: MoneyLine["status"], priceCents: number, captureRef: string | null = null): MoneyLine => ({ id, status, priceCents, captureRef });

describe("planRelease", () => {
  it("captures exactly the approved, unreserved lines", () => {
    const lines = [L("tap", "APPROVED", 12000), L("seal", "APPROVED", 9000), L("rail", "APPROVED", 10000), L("grout", "FAILED", 11000)];
    expect(planRelease({ authorizedCents: 42000, capturedCents: 0 }, lines)).toEqual({ amountCents: 31000, lineIds: ["tap", "seal", "rail"], final: false });
  });

  it("is final only when nothing else is open", () => {
    const lines = [L("a", "CAPTURED", 31000, "c1"), L("grout", "APPROVED", 11000)];
    expect(planRelease({ authorizedCents: 42000, capturedCents: 31000 }, lines)).toEqual({ amountCents: 11000, lineIds: ["grout"], final: true });
  });

  it("is not final while another capture is still in flight", () => {
    const lines = [L("a", "APPROVED", 1000, "c1"), L("b", "APPROVED", 2000)];
    expect(planRelease({ authorizedCents: 3000, capturedCents: 1000 }, lines)?.final).toBe(false);
  });

  it("counts verified-but-unapproved lines as open", () => {
    const lines = [L("a", "APPROVED", 1000), L("b", "VERIFIED", 2000)];
    expect(planRelease({ authorizedCents: 3000, capturedCents: 0 }, lines)?.final).toBe(false);
  });

  it("returns null when nothing is releasable", () => {
    expect(planRelease({ authorizedCents: 3000, capturedCents: 0 }, [L("a", "NEEDS_REVIEW", 3000)])).toBeNull();
  });

  it("refuses to exceed the authorization", () => {
    expect(() => planRelease({ authorizedCents: 3000, capturedCents: 2500 }, [L("a", "APPROVED", 1000)])).toThrow(OverCapture);
  });
});

describe("planClose", () => {
  it("captures what is approved as the final capture", () => {
    const lines = [L("a", "CAPTURED", 1000, "c1"), L("b", "APPROVED", 2000), L("c", "DROPPED", 500)];
    expect(planClose({ authorizedCents: 3500, capturedCents: 1000 }, lines)).toEqual({ kind: "capture", release: { amountCents: 2000, lineIds: ["b"], final: true } });
  });

  it("voids when nothing is left to capture but money is still held", () => {
    const lines = [L("a", "CAPTURED", 1000, "c1"), L("c", "DROPPED", 500)];
    expect(planClose({ authorizedCents: 1500, capturedCents: 1000 }, lines)).toEqual({ kind: "void" });
  });

  it("refuses while lines are still being proved or reviewed", () => {
    expect(() => planClose({ authorizedCents: 1000, capturedCents: 0 }, [L("a", "NEEDS_REVIEW", 1000)])).toThrow(/still open/);
  });
});
