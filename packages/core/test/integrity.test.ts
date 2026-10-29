import { describe, expect, it } from "vitest";
import { evaluateIntegrity, hamming, haversineM, tokenFresh, type IntegrityInput } from "../src/index.ts";

const anchor = { lat: 6.4541, lng: 3.3947 };
const base: IntegrityInput = {
  sample: false,
  tokenValid: true,
  gps: { ...anchor, accuracyM: 12 },
  anchor,
  dhash: "ffff0000ffff0000",
  beforeDhash: "0000ffff0000ffff",
  nearestOtherHamming: 30,
  sameDevice: true,
};

describe("integrity", () => {
  it("measures dHash distance", () => {
    expect(hamming("0000000000000000", "0000000000000000")).toBe(0);
    expect(hamming("0000000000000000", "000000000000000f")).toBe(4);
    expect(hamming("ffffffffffffffff", "0000000000000000")).toBe(64);
    expect(() => hamming("xyz", "0000000000000000")).toThrow();
  });

  it("measures distance on the ground", () => {
    const d = haversineM(anchor, { lat: anchor.lat + 0.001, lng: anchor.lng });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });

  it("passes a fresh photo taken on site", () => {
    const r = evaluateIntegrity(base);
    expect(r.status).toBe("pass");
    expect(r.distanceM).toBe(0);
  });

  it("fails a photo taken more than 150 m away", () => {
    const r = evaluateIntegrity({ ...base, gps: { lat: anchor.lat + 0.002, lng: anchor.lng, accuracyM: 10 } });
    expect(r.status).toBe("fail");
    expect(r.checks.find((c) => c.name === "geofence")?.result).toBe("fail");
  });

  it("sends poor GPS accuracy and a different device to review", () => {
    expect(evaluateIntegrity({ ...base, gps: { ...anchor, accuracyM: 140 } }).status).toBe("review");
    expect(evaluateIntegrity({ ...base, sameDevice: false }).status).toBe("review");
    expect(evaluateIntegrity({ ...base, gps: null }).status).toBe("review");
  });

  it("passes a same-angle photo of a small fix: a close hash but changed pixels", () => {
    const close = { ...base, dhash: base.beforeDhash };
    const fixed = evaluateIntegrity({ ...close, beforeCellDiff: 31.6 }).checks.find((c) => c.name === "no_change");
    expect(fixed?.result).toBe("pass");
    expect(evaluateIntegrity({ ...close, beforeCellDiff: 0.8 }).checks.find((c) => c.name === "no_change")?.result).toBe("fail");
  });

  it("fails an after-photo that is the before-photo, or one already used", () => {
    expect(evaluateIntegrity({ ...base, dhash: base.beforeDhash }).checks.find((c) => c.name === "no_change")?.detail).toBe("after-photo matches before-photo");
    expect(evaluateIntegrity({ ...base, nearestOtherHamming: 6 }).checks.find((c) => c.name === "reuse")?.detail).toBe("photo already used");
    expect(evaluateIntegrity({ ...base, nearestOtherHamming: 7 }).status).toBe("pass");
  });

  it("skips only the camera checks for a judge-mode sample", () => {
    const r = evaluateIntegrity({ ...base, sample: true, tokenValid: false, gps: null, sameDevice: false });
    expect(r.status).toBe("pass");
    expect(r.checks.filter((c) => c.result === "skipped").map((c) => c.name)).toEqual(["capture_token", "geofence", "device"]);
    expect(evaluateIntegrity({ ...base, sample: true, dhash: base.beforeDhash }).status).toBe("fail");
  });

  it("expires capture tokens after 120 s", () => {
    const t0 = new Date("2026-11-03T10:00:00Z");
    expect(tokenFresh(t0, new Date(t0.getTime() + 120_000))).toBe(true);
    expect(tokenFresh(t0, new Date(t0.getTime() + 121_000))).toBe(false);
  });
});
