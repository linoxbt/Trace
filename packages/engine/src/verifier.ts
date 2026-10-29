// The vision step (spec section 6.2). The engine only needs observations back;
// the Claude implementation lives in the AI package.

import type { Acceptance, LineObservation } from "@trace/core";

export interface InspectInput {
  lineId: string;
  title: string;
  acceptance: Acceptance;
  before: Uint8Array;
  after: Uint8Array;
  /** Second pass: a 2x crop of the region the first pass pointed at. */
  crop?: Uint8Array;
  /** The re-judge on copies with the text painted over (Tripwire section 7). */
  masked?: boolean;
}

export interface Verifier {
  readonly model: string;
  inspect(input: InspectInput): Promise<LineObservation>;
}
