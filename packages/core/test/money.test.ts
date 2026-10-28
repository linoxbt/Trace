import { describe, expect, it } from "vitest";
import { formatMoney, fromPayPalValue, toPayPalValue } from "../src/index.ts";

describe("money", () => {
  it("converts cents to PayPal values and back", () => {
    expect(toPayPalValue(42000)).toBe("420.00");
    expect(toPayPalValue(5)).toBe("0.05");
    expect(fromPayPalValue("420.00")).toBe(42000);
    expect(fromPayPalValue("310.5")).toBe(31050);
    expect(fromPayPalValue("7")).toBe(700);
  });

  it("refuses fractions of a cent, negatives and junk", () => {
    expect(() => toPayPalValue(1.5)).toThrow();
    expect(() => toPayPalValue(-1)).toThrow();
    expect(() => fromPayPalValue("1.234")).toThrow();
    expect(() => fromPayPalValue("-1.00")).toThrow();
    expect(() => fromPayPalValue("1e3")).toThrow();
  });

  it("formats for people", () => {
    expect(formatMoney(31000)).toBe("$310.00");
  });
});
