import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export { evalStep, evalViews, type EvalView } from "@trace/eval/runner";

// The step endpoint's key, derived from a secret the scheduled worker and the
// site already share, so nobody else can spend model calls on the evals.

export function evalStepKey(secret: string): string {
  return createHmac("sha256", secret).update("trace-eval-step").digest("hex");
}

export function evalStepAllowed(secret: string | undefined, given: string | null): boolean {
  if (!secret || !given) return false;
  const want = Buffer.from(evalStepKey(secret));
  const got = Buffer.from(given);
  return want.length === got.length && timingSafeEqual(want, got);
}
