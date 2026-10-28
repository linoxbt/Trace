// Capture math from spec section 5. The client and the model never set an
// amount: every capture is recomputed here from line states.

import { assertCents, sum, type Cents } from "./money.ts";
import { isResolvedLine, type LineStatus } from "./states.ts";

export interface MoneyLine {
  id: string;
  status: LineStatus;
  priceCents: Cents;
  /** Our captures row that has reserved this line, while that capture is in flight or done. */
  captureRef: string | null;
}

export interface AuthorizationState {
  authorizedCents: Cents;
  /** Sum of captures that completed or are still in flight (anything not failed). */
  capturedCents: Cents;
}

export interface ReleasePlan {
  amountCents: Cents;
  lineIds: string[];
  /** true when no line is left open after this release, so PayPal can release the rest of the hold. */
  final: boolean;
}

export class OverCapture extends Error {
  constructor(readonly capturedCents: Cents, readonly releasableCents: Cents, readonly authorizedCents: Cents) {
    super(`capture would exceed the authorization: ${capturedCents} + ${releasableCents} > ${authorizedCents}`);
    this.name = "OverCapture";
  }
}

export function releasableLines(lines: readonly MoneyLine[]): MoneyLine[] {
  return lines.filter((l) => l.status === "APPROVED" && l.captureRef === null);
}

/** What one release would capture now, or null when nothing is releasable. */
export function planRelease(auth: AuthorizationState, lines: readonly MoneyLine[]): ReleasePlan | null {
  assertCents(auth.authorizedCents, "authorizedCents");
  assertCents(auth.capturedCents, "capturedCents");
  const take = releasableLines(lines);
  if (take.length === 0) return null;
  const amountCents = sum(take.map((l) => assertCents(l.priceCents, `price of ${l.id}`)));
  if (auth.capturedCents + amountCents > auth.authorizedCents) {
    throw new OverCapture(auth.capturedCents, amountCents, auth.authorizedCents);
  }
  const taking = new Set(take.map((l) => l.id));
  // Final only when every other line is already captured or dropped. A line
  // reserved by another capture still in flight keeps this one non-final.
  const final = lines.every((l) => taking.has(l.id) || isResolvedLine(l.status));
  return { amountCents, lineIds: take.map((l) => l.id), final };
}

export type ClosePlan =
  | { kind: "capture"; release: ReleasePlan }
  | { kind: "void" }
  | { kind: "nothing" };

/**
 * Closing a job once both sides have agreed which lines to drop. `lines` must
 * already show the dropped lines as DROPPED. Every other line must be resolved
 * or approved, or the job is not ready to close.
 */
export function planClose(auth: AuthorizationState, lines: readonly MoneyLine[]): ClosePlan {
  const blocking = lines.filter((l) => !isResolvedLine(l.status) && !(l.status === "APPROVED" && l.captureRef === null));
  if (blocking.length > 0) {
    throw new Error(`cannot close: lines still open: ${blocking.map((l) => `${l.id}=${l.status}`).join(", ")}`);
  }
  const release = planRelease(auth, lines);
  // A final capture also releases whatever is left on the hold, so no void is needed after it.
  if (release) return { kind: "capture", release: { ...release, final: true } };
  if (auth.capturedCents < auth.authorizedCents) return { kind: "void" };
  return { kind: "nothing" };
}
