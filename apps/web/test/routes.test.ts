import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const API = join(import.meta.dirname, "../src/app/api");

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? routes(p) : f === "route.ts" ? [p] : [];
  });
}

/**
 * Every API route goes through route(): a signed-in user, a same-origin check
 * on writes, private no-store answers and errors that leak nothing. These few
 * can't, and each says why.
 */
const OPEN = {
  "health/route.ts": "an uptime monitor calls it signed out; it returns no data about anyone",
  "webhooks/paypal/route.ts": "PayPal calls it; every event is verified with PayPal before it is used",
  "eval/step/route.ts": "the scheduled worker calls it, signed with an HMAC key, compared in constant time",
  "eval/image/[id]/[side]/route.ts": "serves the public eval set's own sample images on /accuracy",
  "paypal/return/route.ts": "PayPal redirects the browser here; it checks the session itself and only redirects",
};

describe("API routes", () => {
  it("all go through route() except the few that can't, and those check the caller themselves", () => {
    const open: string[] = [];
    for (const f of routes(API)) {
      const src = readFileSync(f, "utf8");
      if (!/=\s*route[<(]/.test(src)) open.push(relative(API, f));
    }
    expect(open.sort()).toEqual(Object.keys(OPEN).sort());
    // The open ones still check something.
    const src = (k: string) => readFileSync(join(API, k), "utf8");
    expect(src("webhooks/paypal/route.ts")).toMatch(/handleWebhook/);
    expect(src("eval/step/route.ts")).toMatch(/evalStepAllowed/);
    expect(src("paypal/return/route.ts")).toMatch(/currentUser\(\)/);
  });
});
