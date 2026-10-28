// Verdict policy from spec section 6.2. The model returns observations; this
// code, not the model, turns them into a verdict.

import type { Acceptance, LineObservation } from "./schemas.ts";
import type { IntegrityReport } from "./integrity.ts";

export type Verdict = "VERIFIED" | "NEEDS_REVIEW" | "FAILED";

export interface VerdictDecision {
  verdict: Verdict;
  reasons: string[];
}

export const DEFAULT_CONFIDENCE = 0.8;
export const BORDERLINE_FLOOR = 0.6;

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Acceptance items the model did not report on. A missing check can never pass. */
export function missingChecks(acceptance: Acceptance, obs: LineObservation): string[] {
  const seen = new Set(obs.checks.map((c) => `${c.kind}:${norm(c.check)}`));
  return [
    ...acceptance.must_show.filter((c) => !seen.has(`must_show:${norm(c)}`)),
    ...acceptance.must_not_show.filter((c) => !seen.has(`must_not_show:${norm(c)}`)),
  ];
}

export function decideVerdict(
  acceptance: Acceptance,
  obs: LineObservation,
  integrity: IntegrityReport,
  threshold = DEFAULT_CONFIDENCE,
): VerdictDecision {
  const sure = obs.confidence >= threshold;
  const failedChecks = obs.checks.filter((c) => !c.satisfied);

  const fail: string[] = [];
  if (integrity.status === "fail") {
    fail.push(...integrity.checks.filter((c) => c.result === "fail").map((c) => c.detail));
  }
  if (obs.same_location === "no") fail.push("the photos don't show the same place");
  if (sure && failedChecks.length > 0) fail.push(...failedChecks.map((c) => `${c.check}: ${c.observation}`));
  if (fail.length > 0) return { verdict: "FAILED", reasons: fail };

  const review: string[] = [];
  if (integrity.status === "review") {
    review.push(...integrity.checks.filter((c) => c.result === "review").map((c) => c.detail));
  }
  if (obs.same_location === "uncertain") review.push("not sure the photos show the same place");
  if (obs.recapture !== "no") review.push(obs.recapture === "yes" ? "looks like a photo of a screen or a printout" : "may be a photo of a screen or a printout");
  if (!sure) review.push(`confidence ${obs.confidence.toFixed(2)} is under ${threshold.toFixed(2)}`);
  if (failedChecks.length > 0) review.push(...failedChecks.map((c) => `${c.check}: ${c.observation}`));
  const missing = missingChecks(acceptance, obs);
  if (missing.length > 0) review.push(`not checked: ${missing.join("; ")}`);
  if (review.length > 0) return { verdict: "NEEDS_REVIEW", reasons: review };

  return { verdict: "VERIFIED", reasons: [obs.homeowner_reason] };
}

/** A borderline first pass is re-run on a 2x crop of its region. */
export function needsSecondPass(obs: LineObservation, threshold = DEFAULT_CONFIDENCE): boolean {
  return obs.confidence >= BORDERLINE_FLOOR && obs.confidence < threshold;
}

/**
 * Combine a borderline first pass with its second pass. The second pass decides
 * only when it is confident and agrees with the first on every check it saw;
 * any disagreement sends the line to Needs review.
 */
export function combinePasses(
  acceptance: Acceptance,
  first: LineObservation,
  second: LineObservation,
  integrity: IntegrityReport,
  threshold = DEFAULT_CONFIDENCE,
): VerdictDecision {
  const firstBy = new Map(first.checks.map((c) => [`${c.kind}:${norm(c.check)}`, c.satisfied]));
  const disagree = second.checks.some((c) => {
    const was = firstBy.get(`${c.kind}:${norm(c.check)}`);
    return was !== undefined && was !== c.satisfied;
  });
  if (disagree || first.same_location !== second.same_location) {
    return { verdict: "NEEDS_REVIEW", reasons: ["the two inspection passes disagree"] };
  }
  return decideVerdict(acceptance, second, integrity, threshold);
}
