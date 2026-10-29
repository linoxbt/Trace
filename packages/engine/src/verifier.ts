// The vision step (spec section 6.2). The engine only needs observations back;
// the Claude implementation lives in the AI package.

import type { Acceptance, LineObservation, ProofSpec } from "@trace/core";

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

/** A proof that isn't a single after-photo (section 6.2, verifier adapters). */
export interface ProofInspectInput {
  lineId: string;
  title: string;
  acceptance: Acceptance;
  type: "video" | "document" | "reading" | "deliverable";
  spec: ProofSpec | null;
  /** The line's before-photo, as context. */
  before?: Uint8Array | null;
  /** Video: frames from the clip, with their time in seconds. */
  frames?: { atS: number; jpeg: Uint8Array }[];
  /** Reading: the photo of the gauge or meter. */
  photo?: Uint8Array;
  /** Document, or a file deliverable: a PDF or a JPEG. */
  file?: { bytes: Uint8Array; mime: "application/pdf" | "image/jpeg" };
  /** Deliverable: the text of the page or file. */
  text?: string;
  url?: string;
}

/** What an adapter read off the proof. Code, not the model, judges these. */
export interface Extracted {
  value: number | null;
  unit: string | null;
  vendor: string | null;
  date: string | null;
  total_cents: number | null;
  items: string[];
}

export interface ProofObservation extends LineObservation {
  extracted: Extracted;
  /** Text in the proof addressed to a reviewer or an AI, quoted; null when there is none. */
  instructions_found: string | null;
}

export interface Verifier {
  readonly model: string;
  inspect(input: InspectInput): Promise<LineObservation>;
  /** The other proof types. A verifier without it can only judge photos. */
  inspectProof?(input: ProofInspectInput): Promise<ProofObservation>;
}
