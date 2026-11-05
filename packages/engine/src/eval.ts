// The verifier eval's judging step: one line, one before- and after-photo,
// through the same look, second look and verdict rule as the proof flow. The
// location and capture checks are code and are taken as passed here; the
// text scan has its own eval.

import { combinePasses, decideVerdict, needsSecondPass, proofIntegrity, type Acceptance, type LineObservation, type Verdict } from "@trace/core";
import { createHash } from "node:crypto";
import { cropRegion } from "./image.ts";
import type { Verifier } from "./verifier.ts";

/**
 * Changes whenever the verdict rule's code or threshold does: with the set's
 * version and the verifier's fingerprint, it names exactly what an eval run
 * measured, so a change to any of them starts a fresh run.
 */
export function verdictFingerprint(threshold: number): string {
  return createHash("sha256").update([decideVerdict, needsSecondPass, combinePasses].map(String).join("\n") + `|${threshold}`).digest("hex").slice(0, 10);
}

export interface JudgedPair {
  verdict: Verdict;
  reasons: string[];
  confidence: number;
  passes: number;
  observation: LineObservation;
}

export async function judgePair(
  verifier: Verifier,
  input: { id: string; title: string; acceptance: Acceptance; before: Uint8Array; after: Uint8Array },
  threshold = 0.8,
): Promise<JudgedPair> {
  const integrity = proofIntegrity([]);
  const base = { lineId: input.id, title: input.title, acceptance: input.acceptance, before: input.before, after: input.after };
  const first = await verifier.inspect(base);
  let decision = decideVerdict(input.acceptance, first, integrity, threshold);
  let observation = first;
  let passes = 1;
  if (needsSecondPass(first, threshold) && first.region) {
    const second = await verifier.inspect({ ...base, crop: await cropRegion(input.after, first.region) });
    decision = combinePasses(input.acceptance, first, second, integrity, threshold);
    observation = second;
    passes = 2;
  }
  return { verdict: decision.verdict, reasons: decision.reasons, confidence: observation.confidence, passes, observation };
}
